/**
 * Fee Service
 *
 * Calculates the 1% platform fee on every transaction.
 * Records transaction in the transactions table.
 */

import { query } from '../../../backend/src/db/client.js';

const PLATFORM_FEE_PERCENT = parseFloat(process.env.PLATFORM_FEE_PERCENT || '1') / 100;

/**
 * Calculate platform fee for an amount.
 * @param {number} amountCents
 * @returns {{ platformFeeCents: number, businessNetCents: number }}
 */
export function calculateFee(amountCents) {
  const platformFeeCents = Math.round(amountCents * PLATFORM_FEE_PERCENT);
  const businessNetCents = amountCents - platformFeeCents;
  return { platformFeeCents, businessNetCents };
}

/**
 * Record a completed transaction.
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.businessId
 * @param {'entry_fee'|'booking'|'premium_grace'|'reward_redemption'} params.type
 * @param {number} params.amountCents
 * @param {string} params.stripePaymentIntentId
 * @returns {{ transactionId: string, platformFeeCents: number, businessNetCents: number }}
 */
export async function recordTransaction({
  userId,
  businessId,
  type,
  amountCents,
  stripePaymentIntentId = null,
}) {
  const { platformFeeCents, businessNetCents } = calculateFee(amountCents);

  const { rows } = await query(`
    INSERT INTO transactions (
      user_id, business_id, type, amount_cents,
      platform_fee_cents, business_net_cents, stripe_payment_intent_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id
  `, [userId, businessId, type, amountCents, platformFeeCents, businessNetCents, stripePaymentIntentId]);

  return { transactionId: rows[0].id, platformFeeCents, businessNetCents };
}

/**
 * Get pending (not paid out) transaction totals per business.
 * Used by the bi-weekly payout job.
 * @returns {Array<{ business_id, business_net_total, stripe_account_id }>}
 */
export async function getPendingPayoutTotals() {
  const { rows } = await query(`
    SELECT
      t.business_id,
      SUM(t.business_net_cents) AS business_net_total,
      b.stripe_account_id,
      b.name AS business_name
    FROM transactions t
    JOIN businesses b ON b.id = t.business_id
    WHERE t.paid_out = FALSE
      AND b.stripe_account_id IS NOT NULL
    GROUP BY t.business_id, b.stripe_account_id, b.name
    HAVING SUM(t.business_net_cents) > 0
  `);
  return rows;
}

/**
 * Mark transactions as paid out for a business.
 * @param {string} businessId
 * @param {string} payoutBatchId
 */
export async function markPaidOut(businessId, payoutBatchId) {
  await query(`
    UPDATE transactions
    SET paid_out = TRUE, paid_out_at = NOW(), payout_batch_id = $2
    WHERE business_id = $1 AND paid_out = FALSE
  `, [businessId, payoutBatchId]);
}
