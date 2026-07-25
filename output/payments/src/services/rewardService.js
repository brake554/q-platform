/**
 * Reward Service
 *
 * Manages user reward credit balances earned from ad impressions.
 * Credits can be applied toward entry fees and booking payments.
 */

import { query } from '../../../backend/src/db/client.js';

/**
 * Get a user's current reward balance.
 * @param {string} userId
 * @returns {Promise<number>} Balance in cents
 */
export async function getBalance(userId) {
  const { rows } = await query(
    'SELECT balance_cents FROM reward_credits WHERE user_id = $1',
    [userId]
  );
  return rows[0]?.balance_cents ?? 0;
}

/**
 * Credit reward points to a user.
 * @param {string} userId
 * @param {number} amountCents
 * @param {string} reason
 * @returns {{ newBalance: number }}
 */
export async function creditRewards(userId, amountCents, reason) {
  const { rows } = await query(`
    INSERT INTO reward_credits (user_id, balance_cents)
    VALUES ($1, $2)
    ON CONFLICT (user_id) DO UPDATE
      SET balance_cents = reward_credits.balance_cents + $2,
          updated_at    = NOW()
    RETURNING balance_cents
  `, [userId, amountCents]);

  const newBalance = rows[0].balance_cents;

  await query(`
    INSERT INTO reward_transactions (user_id, delta_cents, reason, balance_after)
    VALUES ($1, $2, $3, $4)
  `, [userId, amountCents, reason, newBalance]);

  return { newBalance };
}

/**
 * Deduct reward credits for a redemption.
 * Validates sufficient balance first.
 * @param {string} userId
 * @param {number} amountCents
 * @param {string} reason
 * @returns {{ newBalance: number }}
 */
export async function redeemRewards(userId, amountCents, reason) {
  const { rows } = await query(`
    UPDATE reward_credits
    SET balance_cents = balance_cents - $2,
        updated_at    = NOW()
    WHERE user_id = $1 AND balance_cents >= $2
    RETURNING balance_cents
  `, [userId, amountCents]);

  if (!rows[0]) throw Object.assign(new Error('Insufficient reward balance'), { statusCode: 400 });

  const newBalance = rows[0].balance_cents;

  await query(`
    INSERT INTO reward_transactions (user_id, delta_cents, reason, balance_after)
    VALUES ($1, $2, $3, $4)
  `, [userId, -amountCents, reason, newBalance]);

  return { newBalance };
}
