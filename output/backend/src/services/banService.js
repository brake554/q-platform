/**
 * Ban Service
 *
 * Issues bans, lifts bans, and maintains the red-flag threshold.
 * Red flag = 3+ active bans across distinct businesses.
 */

import { query, withTransaction } from '../db/client.js';
import { applyInfraction, checkAndSetRedFlag, clearRedFlag } from './scoringService.js';

/**
 * Issue a ban against a user at a business.
 * Docks score, checks red-flag threshold.
 *
 * @param {string} userId
 * @param {string} businessId
 * @param {string} reason
 * @param {string} issuedByStaffId
 * @param {import('socket.io').Server} io
 */
export async function issueBan(userId, businessId, reason, issuedByStaffId, io) {
  return withTransaction(async (client) => {
    // Check for existing active ban at this business
    const { rows: existing } = await client.query(`
      SELECT id FROM bans
      WHERE user_id = $1 AND business_id = $2 AND is_active = TRUE
    `, [userId, businessId]);
    if (existing.length > 0) throw new Error('User already has an active ban at this business');

    // Insert ban
    const { rows } = await client.query(`
      INSERT INTO bans (user_id, business_id, reason, issued_by)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `, [userId, businessId, reason, issuedByStaffId]);
    const banId = rows[0].id;

    // Dock score for ban
    await applyInfraction(userId, 'BANNED_FROM_BUSINESS', businessId);

    // Also remove from queue if currently waiting
    await client.query(`
      UPDATE queue_entries qe
      SET status = 'removed'
      FROM queues q
      WHERE qe.queue_id = q.id
        AND q.business_id = $2
        AND qe.user_id = $1
        AND qe.status IN ('waiting','timer_active')
    `, [userId, businessId]);

    // Check red flag
    const { isRedFlagged, banCount } = await checkAndSetRedFlag(userId);

    // Notify user of the ban
    if (io) {
      io.to(`user:${userId}`).emit('ban:issued', {
        businessId,
        reason,
        isRedFlagged,
        message: isRedFlagged
          ? 'You have been banned and issued a red flag due to multiple bans.'
          : `You have been banned from this business. Reason: ${reason}`,
      });
    }

    return { banId, isRedFlagged, banCount };
  });
}

/**
 * Lift a ban.
 * Re-checks red flag after lifting.
 * @param {string} banId
 * @param {string} liftedByStaffId
 * @param {import('socket.io').Server} io
 */
export async function liftBan(banId, liftedByStaffId, io) {
  const { rows } = await query(`
    UPDATE bans
    SET is_active = FALSE, lifted_at = NOW(), lifted_by = $2
    WHERE id = $1
    RETURNING user_id, business_id
  `, [banId, liftedByStaffId]);
  if (!rows[0]) throw new Error('Ban not found');

  const { user_id: userId, business_id: businessId } = rows[0];

  // Re-check red flag — may no longer be warranted
  const { isRedFlagged, banCount } = await checkAndSetRedFlag(userId);
  if (!isRedFlagged) {
    await clearRedFlag(userId);
  }

  if (io) {
    io.to(`user:${userId}`).emit('ban:lifted', {
      businessId,
      message: 'Your ban at this business has been lifted.',
    });
  }

  return { userId, businessId, isRedFlagged, banCount };
}

/**
 * Get all active bans for a user (used by geo-fence check + admin views).
 * @param {string} userId
 */
export async function getActiveBans(userId) {
  const { rows } = await query(`
    SELECT b.*, bus.name AS business_name
    FROM bans b
    JOIN businesses bus ON bus.id = b.business_id
    WHERE b.user_id = $1 AND b.is_active = TRUE
    ORDER BY b.issued_at DESC
  `, [userId]);
  return rows;
}

/**
 * Get all bans for a business (for staff panel).
 * @param {string} businessId
 * @param {boolean} activeOnly
 */
export async function getBansForBusiness(businessId, activeOnly = true) {
  const { rows } = await query(`
    SELECT b.*, u.full_name, u.profile_photo_url, bs.score
    FROM bans b
    JOIN users u ON u.id = b.user_id
    LEFT JOIN behavior_scores bs ON bs.user_id = b.user_id
    WHERE b.business_id = $1 ${activeOnly ? 'AND b.is_active = TRUE' : ''}
    ORDER BY b.issued_at DESC
  `, [businessId]);
  return rows;
}
