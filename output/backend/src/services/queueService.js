/**
 * Queue Service
 *
 * State machine for queue entries:
 *   waiting → timer_active → admitted
 *          ↘ expired (re-queued at back)
 *          ↘ removed (staff action)
 */

import { query, withTransaction } from '../db/client.js';
import { redis, QUEUE_KEY } from '../redis/client.js';
import { startAdmissionTimer, cancelAdmissionTimer } from './timerService.js';
import { applyInfraction, applyCleanVisit } from './scoringService.js';

/**
 * Get or create the active queue for a business.
 * @param {string} businessId
 * @returns {{ id: string }}
 */
export async function getOrCreateActiveQueue(businessId) {
  const { rows } = await query(`
    SELECT id FROM queues WHERE business_id = $1 AND is_active = TRUE
  `, [businessId]);
  if (rows[0]) return rows[0];

  const { rows: created } = await query(`
    INSERT INTO queues (business_id) VALUES ($1) RETURNING id
  `, [businessId]);
  return created[0];
}

/**
 * Join the queue for a business.
 * Validates: user is verified, not already in queue, not banned, Q slots available.
 *
 * @param {string} userId
 * @param {string} businessId
 * @param {number} partySize
 * @returns {{ entryId: string, position: number }}
 */
export async function joinQueue(userId, businessId, partySize = 1) {
  return withTransaction(async (client) => {
    // Fetch business config
    const { rows: bizRows } = await client.query(`
      SELECT id, q_slot_allocation, capacity, current_occupancy, admission_timer_seconds
      FROM businesses WHERE id = $1 AND is_active = TRUE
    `, [businessId]);
    if (!bizRows[0]) throw new Error('Business not found or inactive');
    const business = bizRows[0];

    // Check for active ban
    const { rows: banRows } = await client.query(`
      SELECT id FROM bans WHERE user_id = $1 AND business_id = $2 AND is_active = TRUE LIMIT 1
    `, [userId, businessId]);
    if (banRows.length > 0) throw new Error('You are banned from this business');

    // Get or create active queue
    let { rows: queueRows } = await client.query(`
      SELECT id FROM queues WHERE business_id = $1 AND is_active = TRUE
    `, [businessId]);
    if (!queueRows[0]) {
      const { rows: newQueue } = await client.query(`
        INSERT INTO queues (business_id) VALUES ($1) RETURNING id
      `, [businessId]);
      queueRows = newQueue;
    }
    const queueId = queueRows[0].id;

    // Check if user already in this queue
    const { rows: existing } = await client.query(`
      SELECT id FROM queue_entries
      WHERE queue_id = $1 AND user_id = $2 AND status IN ('waiting','timer_active')
    `, [queueId, userId]);
    if (existing.length > 0) throw new Error('You are already in this queue');

    // Check Q slot allocation (count of currently admitted entries from Q)
    const { rows: admittedRows } = await client.query(`
      SELECT COUNT(*) AS cnt FROM queue_entries
      WHERE queue_id = $1 AND status = 'admitted'
    `, [queueId]);
    if (parseInt(admittedRows[0].cnt, 10) >= business.q_slot_allocation) {
      throw new Error('Q slots are currently full. Please try again soon.');
    }

    // Determine next position
    const { rows: posRows } = await client.query(`
      SELECT COALESCE(MAX(position), 0) + 1 AS next_pos
      FROM queue_entries
      WHERE queue_id = $1 AND status IN ('waiting','timer_active')
    `, [queueId]);
    const position = posRows[0].next_pos;

    // Insert entry
    const { rows: entryRows } = await client.query(`
      INSERT INTO queue_entries (queue_id, user_id, position, party_size)
      VALUES ($1, $2, $3, $4)
      RETURNING id, position
    `, [queueId, userId, position, partySize]);

    // Sync position to Redis sorted set (score = joined_at timestamp)
    await redis.zadd(QUEUE_KEY(businessId), Date.now(), userId);

    return { entryId: entryRows[0].id, position: entryRows[0].position };
  });
}

/**
 * Get current queue state for a business.
 * Returns ordered list of entries.
 * @param {string} businessId
 */
export async function getQueueState(businessId) {
  const { rows } = await query(`
    SELECT
      qe.id,
      qe.user_id,
      qe.position,
      qe.status,
      qe.party_size,
      qe.joined_at,
      qe.timer_started_at,
      u.full_name,
      u.profile_photo_url,
      bs.score,
      rf.is_active AS is_red_flagged
    FROM queues q
    JOIN queue_entries qe ON qe.queue_id = q.id
    JOIN users u ON u.id = qe.user_id
    LEFT JOIN behavior_scores bs ON bs.user_id = qe.user_id
    LEFT JOIN red_flags rf ON rf.user_id = qe.user_id AND rf.is_active = TRUE
    WHERE q.business_id = $1 AND q.is_active = TRUE
      AND qe.status IN ('waiting','timer_active')
    ORDER BY qe.position ASC
  `, [businessId]);

  return rows;
}

/**
 * Get a single user's position in the queue.
 * @param {string} userId
 * @param {string} businessId
 */
export async function getUserPosition(userId, businessId) {
  const { rows } = await query(`
    SELECT qe.id, qe.position, qe.status, qe.timer_started_at, q.id AS queue_id
    FROM queues q
    JOIN queue_entries qe ON qe.queue_id = q.id
    WHERE q.business_id = $1 AND q.is_active = TRUE
      AND qe.user_id = $2
      AND qe.status IN ('waiting','timer_active')
    LIMIT 1
  `, [businessId, userId]);
  return rows[0] || null;
}

/**
 * Admit a user — called by staff.
 * Triggers admission timer so user has N seconds to confirm entry.
 * @param {string} entryId
 * @param {import('socket.io').Server} io
 */
export async function admitEntry(entryId, io) {
  const { rows } = await query(`
    SELECT qe.*, q.business_id, b.admission_timer_seconds
    FROM queue_entries qe
    JOIN queues q ON q.id = qe.queue_id
    JOIN businesses b ON b.id = q.business_id
    WHERE qe.id = $1
  `, [entryId]);
  if (!rows[0]) throw new Error('Queue entry not found');
  const entry = rows[0];
  if (entry.status !== 'waiting') throw new Error(`Entry is ${entry.status}, cannot admit`);

  await startAdmissionTimer(
    entryId,
    entry.user_id,
    entry.business_id,
    entry.admission_timer_seconds
  );

  // Broadcast updated queue
  io.to(`business:${entry.business_id}`).emit('queue:updated', { businessId: entry.business_id });

  return { started: true, timerSeconds: entry.admission_timer_seconds };
}

/**
 * User confirms entry during their timer window.
 * Marks admitted, cancels timer, applies clean-visit recovery, increments occupancy.
 * @param {string} userId
 * @param {string} businessId
 * @param {import('socket.io').Server} io
 */
export async function confirmEntry(userId, businessId, io) {
  const { rows } = await query(`
    SELECT qe.id, qe.status
    FROM queues q
    JOIN queue_entries qe ON qe.queue_id = q.id
    WHERE q.business_id = $1 AND q.is_active = TRUE
      AND qe.user_id = $2 AND qe.status = 'timer_active'
    LIMIT 1
  `, [businessId, userId]);
  if (!rows[0]) throw new Error('No active timer found for this user');

  const entryId = rows[0].id;

  await query(`
    UPDATE queue_entries SET status = 'admitted', admitted_at = NOW() WHERE id = $1
  `, [entryId]);

  await cancelAdmissionTimer(businessId, userId);

  // Apply clean-visit recovery
  const { newScore } = await applyCleanVisit(userId, businessId);

  // Notify user they're cleared to enter
  io.to(`user:${userId}`).emit('queue:admitted', {
    businessId,
    message: 'You are cleared to enter! Please proceed to the entrance.',
    newScore,
  });

  io.to(`business:${businessId}`).emit('queue:updated', { businessId });

  return { admitted: true, newScore };
}

/**
 * Staff removes a user from the queue.
 * @param {string} entryId
 * @param {string} removedByStaffId
 * @param {import('socket.io').Server} io
 */
export async function removeFromQueue(entryId, removedByStaffId, io) {
  const { rows } = await query(`
    SELECT qe.*, q.business_id
    FROM queue_entries qe JOIN queues q ON q.id = qe.queue_id
    WHERE qe.id = $1
  `, [entryId]);
  if (!rows[0]) throw new Error('Entry not found');
  const entry = rows[0];

  await query(`
    UPDATE queue_entries SET status = 'removed' WHERE id = $1
  `, [entryId]);

  // Cancel any running timer
  await cancelAdmissionTimer(entry.business_id, entry.user_id);

  // Dock score
  await applyInfraction(entry.user_id, 'REMOVED_FROM_QUEUE', entry.business_id);

  // Remove from Redis sorted set
  await redis.zrem(QUEUE_KEY(entry.business_id), entry.user_id);

  if (io) {
    io.to(`user:${entry.user_id}`).emit('queue:removed', {
      businessId: entry.business_id,
      message: 'You have been removed from the queue by staff.',
      scoreDock: -15,
    });
    io.to(`business:${entry.business_id}`).emit('queue:updated', { businessId: entry.business_id });
  }
}

/**
 * User voluntarily leaves the queue.
 * @param {string} userId
 * @param {string} businessId
 */
export async function leaveQueue(userId, businessId) {
  const { rows } = await query(`
    SELECT qe.id
    FROM queues q JOIN queue_entries qe ON qe.queue_id = q.id
    WHERE q.business_id = $1 AND q.is_active = TRUE
      AND qe.user_id = $2 AND qe.status IN ('waiting','timer_active')
    LIMIT 1
  `, [businessId, userId]);
  if (!rows[0]) throw new Error('Not in queue');

  await query(`UPDATE queue_entries SET status = 'removed' WHERE id = $1`, [rows[0].id]);
  await cancelAdmissionTimer(businessId, userId);
  await redis.zrem(QUEUE_KEY(businessId), userId);
}
