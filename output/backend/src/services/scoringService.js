/**
 * Scoring Service
 *
 * Business rules (whitepaper):
 * - Default score: 100
 * - Infractions dock score; severity varies by type
 * - Clean visit (no infraction) → auto-recover toward 100
 * - Recovery is slower the lower the score (tiered curve)
 * - Red flag: triggered at 3+ active bans across distinct businesses
 */

import { query, withTransaction } from '../db/client.js';

// ─── Infraction dock amounts ──────────────────────────────────────────────────
export const DOCK = {
  NO_SHOW_BOOKING: -20,
  MISS_ADMISSION_TIMER: -10,
  MISS_GRACE_PERIOD: -15,
  REMOVED_FROM_QUEUE: -15,
  BANNED_FROM_BUSINESS: -30,
};

// ─── Recovery amounts per score tier (per clean visit) ───────────────────────
function recoveryAmount(currentScore) {
  if (currentScore >= 80) return 10;   // Full recovery in ~2 clean visits
  if (currentScore >= 50) return 5;   // Moderate recovery
  if (currentScore >= 20) return 2;   // Slow recovery
  return 1;                            // Floor recovery (score 1–19)
}

/**
 * Apply an infraction dock to a user's score.
 * @param {string} userId
 * @param {keyof typeof DOCK} infraType - e.g. 'NO_SHOW_BOOKING'
 * @param {string|null} businessId
 * @returns {{ newScore: number }}
 */
export async function applyInfraction(userId, infraType, businessId = null) {
  const delta = DOCK[infraType];
  if (delta === undefined) throw new Error(`Unknown infraction type: ${infraType}`);

  return withTransaction(async (client) => {
    // Upsert behavior_scores row
    await client.query(`
      INSERT INTO behavior_scores (user_id, score, last_infraction_at)
      VALUES ($1, 100, NOW())
      ON CONFLICT (user_id) DO NOTHING
    `, [userId]);

    const { rows } = await client.query(`
      UPDATE behavior_scores
      SET score             = GREATEST(0, score + $2),
          last_infraction_at = NOW(),
          updated_at         = NOW()
      WHERE user_id = $1
      RETURNING score
    `, [userId, delta]);

    const newScore = rows[0].score;

    // Write audit event
    await client.query(`
      INSERT INTO score_events (user_id, business_id, delta, reason, score_after)
      VALUES ($1, $2, $3, $4, $5)
    `, [userId, businessId, delta, infraType, newScore]);

    return { newScore };
  });
}

/**
 * Apply clean-visit recovery to a user's score.
 * Should be called when a user is admitted to a business without any infraction.
 * @param {string} userId
 * @param {string|null} businessId
 * @returns {{ newScore: number, recovered: number }}
 */
export async function applyCleanVisit(userId, businessId = null) {
  return withTransaction(async (client) => {
    await client.query(`
      INSERT INTO behavior_scores (user_id, score, last_clean_visit_at)
      VALUES ($1, 100, NOW())
      ON CONFLICT (user_id) DO NOTHING
    `, [userId]);

    // Read current score to determine recovery amount
    const { rows: current } = await client.query(
      'SELECT score FROM behavior_scores WHERE user_id = $1',
      [userId]
    );
    const currentScore = current[0]?.score ?? 100;

    // Already maxed out — no-op
    if (currentScore >= 100) return { newScore: 100, recovered: 0 };

    const amount = recoveryAmount(currentScore);

    const { rows } = await client.query(`
      UPDATE behavior_scores
      SET score               = LEAST(100, score + $2),
          last_clean_visit_at = NOW(),
          updated_at          = NOW()
      WHERE user_id = $1
      RETURNING score
    `, [userId, amount]);

    const newScore = rows[0].score;

    await client.query(`
      INSERT INTO score_events (user_id, business_id, delta, reason, score_after)
      VALUES ($1, $2, $3, 'CLEAN_VISIT_RECOVERY', $4)
    `, [userId, businessId, amount, newScore]);

    return { newScore, recovered: amount };
  });
}

/**
 * Get a user's current score.
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function getScore(userId) {
  const { rows } = await query(
    'SELECT score FROM behavior_scores WHERE user_id = $1',
    [userId]
  );
  return rows[0]?.score ?? 100;
}

/**
 * Check whether a user should be red-flagged.
 * Red flag = 3 or more active bans across distinct businesses.
 * Creates or updates the red_flags entry.
 * @param {string} userId
 * @returns {{ isRedFlagged: boolean, banCount: number }}
 */
export async function checkAndSetRedFlag(userId) {
  const { rows } = await query(`
    SELECT COUNT(DISTINCT business_id) AS ban_count
    FROM bans
    WHERE user_id = $1 AND is_active = TRUE
  `, [userId]);

  const banCount = parseInt(rows[0].ban_count, 10);
  const shouldFlag = banCount >= 3;

  if (shouldFlag) {
    await query(`
      INSERT INTO red_flags (user_id, ban_count, flagged_at, is_active)
      VALUES ($1, $2, NOW(), TRUE)
      ON CONFLICT (user_id) DO UPDATE
        SET ban_count  = $2,
            is_active  = TRUE,
            flagged_at = NOW()
    `, [userId, banCount]);
  }

  return { isRedFlagged: shouldFlag, banCount };
}

/**
 * Clear a user's red flag (called after manual staff clearance and ban lifts).
 * @param {string} userId
 */
export async function clearRedFlag(userId) {
  await query(`
    UPDATE red_flags SET is_active = FALSE WHERE user_id = $1
  `, [userId]);
}

/**
 * Get score history for a user.
 * @param {string} userId
 * @param {number} limit
 */
export async function getScoreHistory(userId, limit = 20) {
  const { rows } = await query(`
    SELECT se.*, b.name AS business_name
    FROM score_events se
    LEFT JOIN businesses b ON b.id = se.business_id
    WHERE se.user_id = $1
    ORDER BY se.created_at DESC
    LIMIT $2
  `, [userId, limit]);
  return rows;
}
