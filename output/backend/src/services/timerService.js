/**
 * Timer Service
 *
 * Manages the 90-second (1 min 30 sec) admission countdown per whitepaper.
 * Uses BullMQ for reliable, persistence-backed job scheduling.
 * If server restarts, BullMQ re-runs pending jobs from Redis.
 */

import { Queue, Worker } from 'bullmq';
import { redis, TIMER_KEY } from '../redis/client.js';
import { query } from '../db/client.js';
import { applyInfraction } from './scoringService.js';

const BULL_CONNECTION = { client: redis };

// BullMQ queue for admission timers
export const admissionTimerQueue = new Queue('admission-timers', {
  connection: BULL_CONNECTION,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: 100,
  },
});

// BullMQ queue for booking grace-period timers
export const graceTimerQueue = new Queue('grace-timers', {
  connection: BULL_CONNECTION,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: 100,
  },
});

// io is injected after socket server is created
let _io = null;
export function setSocketIO(io) {
  _io = io;
}

// ─── Admission timer ──────────────────────────────────────────────────────────

/**
 * Start the admission countdown for a queue entry.
 * The timer delay is taken from the business's admission_timer_seconds setting.
 *
 * @param {string} entryId - queue_entries.id
 * @param {string} userId
 * @param {string} businessId
 * @param {number} timerSeconds - from businesses.admission_timer_seconds (default 90)
 */
export async function startAdmissionTimer(entryId, userId, businessId, timerSeconds = 90) {
  const delay = timerSeconds * 1000;

  const job = await admissionTimerQueue.add(
    'expire-entry',
    { entryId, userId, businessId },
    { delay, jobId: `timer:${entryId}` }
  );

  // Store job ID in Redis for fast cancellation
  await redis.set(TIMER_KEY(businessId, userId), job.id, 'EX', timerSeconds + 60);

  // Mark entry as timer_active
  await query(`
    UPDATE queue_entries
    SET status = 'timer_active', timer_started_at = NOW()
    WHERE id = $1
  `, [entryId]);

  // Notify user their timer has started
  if (_io) {
    _io.to(`user:${userId}`).emit('queue:timer_start', {
      entryId,
      businessId,
      seconds: timerSeconds,
      startedAt: new Date().toISOString(),
    });
  }

  return job.id;
}

/**
 * Cancel a running admission timer (user confirmed entry in time).
 * @param {string} businessId
 * @param {string} userId
 */
export async function cancelAdmissionTimer(businessId, userId) {
  const jobId = await redis.get(TIMER_KEY(businessId, userId));
  if (jobId) {
    const job = await admissionTimerQueue.getJob(jobId);
    if (job) await job.remove();
    await redis.del(TIMER_KEY(businessId, userId));
  }
}

// ─── Grace timer ─────────────────────────────────────────────────────────────

/**
 * Schedule a grace-period expiry job for a booking.
 * Fires at grace_deadline_at.
 * @param {string} bookingId
 * @param {Date} graceDeadline
 */
export async function scheduleGraceTimer(bookingId, graceDeadline) {
  const delay = graceDeadline.getTime() - Date.now();
  if (delay <= 0) return; // Already expired

  await graceTimerQueue.add(
    'expire-booking',
    { bookingId },
    { delay, jobId: `grace:${bookingId}` }
  );
}

/**
 * Cancel a grace timer (user checked in before deadline).
 * @param {string} bookingId
 */
export async function cancelGraceTimer(bookingId) {
  const job = await graceTimerQueue.getJob(`grace:${bookingId}`);
  if (job) await job.remove();
}

// ─── Workers (run in same process for simplicity; split to separate process in prod) ───

export function startWorkers() {
  // Admission timer worker
  new Worker('admission-timers', async (job) => {
    const { entryId, userId, businessId } = job.data;

    // Check if user already confirmed entry — idempotency guard
    const { rows } = await query(
      'SELECT status FROM queue_entries WHERE id = $1',
      [entryId]
    );
    if (!rows[0] || rows[0].status !== 'timer_active') return;

    // Timer expired — move user to back of queue, dock score
    await query(`
      UPDATE queue_entries
      SET status = 'expired', expired_at = NOW()
      WHERE id = $1
    `, [entryId]);

    // Re-queue: find the business queue and insert at the back
    const { rows: queueRows } = await query(`
      SELECT q.id, COALESCE(MAX(qe.position), 0) AS max_pos
      FROM queues q
      LEFT JOIN queue_entries qe ON qe.queue_id = q.id AND qe.status = 'waiting'
      WHERE q.business_id = $1 AND q.is_active = TRUE
      GROUP BY q.id
      LIMIT 1
    `, [businessId]);

    if (queueRows[0]) {
      await query(`
        INSERT INTO queue_entries (queue_id, user_id, position, status, party_size)
        SELECT $1, $2, $3, 'waiting', party_size
        FROM queue_entries WHERE id = $4
      `, [queueRows[0].id, userId, queueRows[0].max_pos + 1, entryId]);
    }

    // Dock score
    await applyInfraction(userId, 'MISS_ADMISSION_TIMER', businessId);

    // Notify user
    if (_io) {
      _io.to(`user:${userId}`).emit('queue:timer_expired', {
        businessId,
        message: 'Your admission window expired. You have been moved to the back of the queue.',
        scoreDock: -10,
      });

      // Broadcast updated queue to all members
      _io.to(`business:${businessId}`).emit('queue:updated', { businessId });
    }
  }, { connection: BULL_CONNECTION, concurrency: 50 });

  // Grace timer worker
  new Worker('grace-timers', async (job) => {
    const { bookingId } = job.data;

    const { rows } = await query(
      'SELECT * FROM bookings WHERE id = $1',
      [bookingId]
    );
    if (!rows[0] || rows[0].status !== 'confirmed') return;

    // Mark as no-show
    await query(`
      UPDATE bookings SET status = 'no_show' WHERE id = $1
    `, [bookingId]);

    // Dock score
    await applyInfraction(rows[0].user_id, 'MISS_GRACE_PERIOD', rows[0].business_id);

    if (_io) {
      _io.to(`user:${rows[0].user_id}`).emit('booking:no_show', {
        bookingId,
        message: 'Your grace period expired. Your booking has been marked as a no-show.',
        scoreDock: -15,
      });
    }
  }, { connection: BULL_CONNECTION, concurrency: 20 });
}
