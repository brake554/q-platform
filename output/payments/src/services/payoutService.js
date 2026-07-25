/**
 * Payout Service
 *
 * Used by the bi-weekly cron job to issue Stripe transfers to businesses.
 */

import { getPendingPayoutTotals, markPaidOut } from './feeService.js';
import { transferToBusiness } from './stripeService.js';
import { randomUUID } from 'crypto';

/**
 * Execute bi-weekly payouts for all businesses with pending balances.
 * Logs results and marks transactions as paid_out.
 *
 * @returns {{ processed: number, totalPaidCents: number, errors: string[] }}
 */
export async function runPayoutBatch() {
  const businesses = await getPendingPayoutTotals();
  const batchId = `payout_${new Date().toISOString().slice(0, 10)}_${randomUUID().slice(0, 8)}`;
  const errors = [];
  let processed = 0;
  let totalPaidCents = 0;

  console.log(`[Payouts] Starting batch ${batchId} — ${businesses.length} businesses`);

  for (const biz of businesses) {
    try {
      const netCents = parseInt(biz.business_net_total, 10);
      if (netCents <= 0) continue;

      await transferToBusiness(
        biz.stripe_account_id,
        netCents,
        `Q bi-weekly payout — batch ${batchId}`
      );

      await markPaidOut(biz.business_id, batchId);

      processed++;
      totalPaidCents += netCents;
      console.log(`[Payouts] Paid ${biz.business_name}: $${(netCents / 100).toFixed(2)}`);
    } catch (err) {
      const msg = `Failed payout for ${biz.business_name} (${biz.business_id}): ${err.message}`;
      errors.push(msg);
      console.error(`[Payouts] ${msg}`);
    }
  }

  console.log(`[Payouts] Batch ${batchId} complete: ${processed}/${businesses.length} succeeded`);
  return { processed, totalPaidCents, errors, batchId };
}
