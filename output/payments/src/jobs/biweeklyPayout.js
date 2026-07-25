/**
 * Bi-weekly Payout Cron Job
 *
 * Runs every other Monday at 3:00 AM UTC.
 * PAYOUT_CRON_SCHEDULE env var format: "0 3 * * 1/2"
 *
 * Usage: import and call startPayoutCron() at server startup.
 */

import cron from 'node-cron';
import { runPayoutBatch } from '../services/payoutService.js';
import 'dotenv/config';

// Default: every other Monday at 03:00 UTC
const SCHEDULE = process.env.PAYOUT_CRON_SCHEDULE || '0 3 * * 1/2';

let cronJob = null;

export function startPayoutCron() {
  if (!cron.validate(SCHEDULE)) {
    console.error(`[Payouts] Invalid cron schedule: ${SCHEDULE}`);
    return;
  }

  cronJob = cron.schedule(SCHEDULE, async () => {
    console.log(`[Payouts] Cron triggered at ${new Date().toISOString()}`);
    try {
      const result = await runPayoutBatch();
      console.log('[Payouts] Result:', result);
    } catch (err) {
      console.error('[Payouts] Cron job failed:', err);
    }
  }, { timezone: 'UTC' });

  console.log(`[Payouts] Cron scheduled: ${SCHEDULE}`);
}

export function stopPayoutCron() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
  }
}

/**
 * Manually trigger a payout run (for admin use / testing).
 */
export async function triggerManualPayout() {
  console.log('[Payouts] Manual payout triggered');
  return runPayoutBatch();
}
