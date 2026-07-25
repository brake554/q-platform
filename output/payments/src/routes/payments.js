/**
 * Payment Routes
 *
 * POST /api/payments/intent              — Create payment intent
 * POST /api/payments/webhook             — Stripe webhook handler
 * POST /api/payments/premium             — Purchase premium grace time
 * GET  /api/payments/transactions        — User transaction history
 * GET  /api/payments/business/:id/transactions — Business transactions
 * GET  /api/payments/business/:id/payouts     — Payout history
 * POST /api/payments/business/onboard    — Start Stripe Connect onboarding
 * GET  /api/payments/business/onboard/return — Onboarding return
 * POST /api/payments/rewards/redeem      — Redeem reward credits
 */

import { createPaymentIntent, createConnectAccount, constructWebhookEvent, getAccountStatus } from '../services/stripeService.js';
import { recordTransaction } from '../services/feeService.js';
import { createPremiumGraceIntent, fulfillPremiumGrace } from '../services/premiumService.js';
import { redeemRewards } from '../services/rewardService.js';
import { query } from '../../../backend/src/db/client.js';
import { requireAuth, requireVerified, requirePlatformAdmin } from '../../../backend/src/middleware/auth.js';
import { requireBusinessStaff, requireBusinessAdmin } from '../../../backend/src/middleware/venueAuth.js';
import { triggerManualPayout } from '../jobs/biweeklyPayout.js';

export default async function paymentRoutes(fastify) {
  // Create payment intent for entry fee or booking
  fastify.post('/intent', {
    preHandler: [requireVerified],
  }, async (request, reply) => {
    const { businessId, type = 'entry_fee', rewardCentsToApply = 0 } = request.body;
    const userId = request.user.user_id;

    const { rows: biz } = await query(
      'SELECT entry_fee_cents, name FROM businesses WHERE id = $1',
      [businessId]
    );
    if (!biz[0]) return reply.code(404).send({ error: 'Business not found' });

    let amountCents = biz[0].entry_fee_cents;

    // Apply reward credit discount if requested
    if (rewardCentsToApply > 0) {
      await redeemRewards(userId, Math.min(rewardCentsToApply, amountCents), 'cover_offset');
      amountCents = Math.max(0, amountCents - rewardCentsToApply);
    }

    // If amount is 0 (fully covered by rewards), skip Stripe
    if (amountCents === 0) {
      await recordTransaction({ userId, businessId, type, amountCents: biz[0].entry_fee_cents });
      return { free: true };
    }

    const { rows: userRows } = await query('SELECT email FROM users WHERE id = $1', [userId]);
    const result = await createPaymentIntent({
      userId,
      email: userRows[0].email,
      businessId,
      amountCents,
      description: `Q entry fee — ${biz[0].name}`,
      metadata: { type, business_id: businessId },
    });

    return result;
  });

  // Stripe webhook — MUST receive raw body
  fastify.post('/webhook', {
    config: { rawBody: true },
  }, async (request, reply) => {
    const sig = request.headers['stripe-signature'];
    let event;

    try {
      event = constructWebhookEvent(request.rawBody, sig);
    } catch (err) {
      return reply.code(400).send({ error: `Webhook signature verification failed: ${err.message}` });
    }

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const intent = event.data.object;
        const { type, business_id, booking_id, minutes } = intent.metadata;

        if (type === 'premium_grace') {
          await fulfillPremiumGrace(intent.id, intent.metadata);
        } else {
          // Record entry fee / booking transaction
          const { rows: userRows } = await query(
            'SELECT id FROM users WHERE stripe_customer_id = $1',
            [intent.customer]
          );
          if (userRows[0]) {
            await recordTransaction({
              userId: userRows[0].id,
              businessId: business_id,
              type: type || 'entry_fee',
              amountCents: intent.amount,
              stripePaymentIntentId: intent.id,
            });
          }
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        // Log; no DB action needed — queue admission was not granted
        console.warn('[Stripe] Payment failed:', event.data.object.id);
        break;
      }

      case 'account.updated': {
        // Connected account completed onboarding or details changed
        const account = event.data.object;
        console.log('[Stripe] Account updated:', account.id, {
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
        });
        break;
      }

      default:
        // Unhandled event type — acknowledge receipt
        break;
    }

    return { received: true };
  });

  // Purchase premium grace time
  fastify.post('/premium', {
    preHandler: [requireVerified],
  }, async (request, reply) => {
    const { businessId, bookingId, minutesPurchased } = request.body;
    const { rows: userRows } = await query('SELECT email FROM users WHERE id = $1', [request.user.user_id]);

    const result = await createPremiumGraceIntent({
      userId: request.user.user_id,
      email: userRows[0].email,
      businessId,
      bookingId,
      minutesPurchased,
    });

    return result;
  });

  // User transaction history
  fastify.get('/transactions', {
    preHandler: [requireAuth],
  }, async (request) => {
    const { rows } = await query(`
      SELECT t.*, b.name AS business_name, b.category
      FROM transactions t JOIN businesses b ON b.id = t.business_id
      WHERE t.user_id = $1
      ORDER BY t.created_at DESC LIMIT 50
    `, [request.user.user_id]);
    return { transactions: rows };
  });

  // Business transaction history (for staff)
  fastify.get('/business/:businessId/transactions', {
    preHandler: [requireBusinessStaff],
  }, async (request) => {
    const { rows } = await query(`
      SELECT t.*, u.full_name AS user_name
      FROM transactions t JOIN users u ON u.id = t.user_id
      WHERE t.business_id = $1
      ORDER BY t.created_at DESC LIMIT 100
    `, [request.params.businessId]);
    return { transactions: rows };
  });

  // Business payout history
  fastify.get('/business/:businessId/payouts', {
    preHandler: [requireBusinessAdmin],
  }, async (request) => {
    const { rows } = await query(`
      SELECT
        payout_batch_id,
        paid_out_at,
        SUM(business_net_cents) AS net_total_cents,
        COUNT(*) AS transaction_count
      FROM transactions
      WHERE business_id = $1 AND paid_out = TRUE
      GROUP BY payout_batch_id, paid_out_at
      ORDER BY paid_out_at DESC
    `, [request.params.businessId]);

    const { rows: pending } = await query(`
      SELECT SUM(business_net_cents) AS pending_cents
      FROM transactions WHERE business_id = $1 AND paid_out = FALSE
    `, [request.params.businessId]);

    return {
      payouts: rows,
      pending_cents: parseInt(pending[0]?.pending_cents || '0', 10),
    };
  });

  // Start Stripe Connect onboarding
  fastify.post('/business/onboard', {
    preHandler: [requireBusinessAdmin],
  }, async (request, reply) => {
    const { businessId } = request.body;
    const { rows } = await query('SELECT name FROM businesses WHERE id = $1', [businessId]);
    if (!rows[0]) return reply.code(404).send({ error: 'Business not found' });

    const returnUrl = `${process.env.ADMIN_URL}/payouts?onboarded=true`;
    const refreshUrl = `${process.env.ADMIN_URL}/payouts?refresh=true`;

    const result = await createConnectAccount(businessId, rows[0].name, returnUrl, refreshUrl);
    return result;
  });

  // Stripe Connect return URL handler
  fastify.get('/business/onboard/return', {
    preHandler: [requireBusinessAdmin],
  }, async (request, reply) => {
    const { businessId } = request.query;
    const { rows } = await query('SELECT stripe_account_id FROM businesses WHERE id = $1', [businessId]);
    if (rows[0]?.stripe_account_id) {
      const status = await getAccountStatus(rows[0].stripe_account_id);
      return status;
    }
    return reply.code(404).send({ error: 'No Stripe account found' });
  });

  // Redeem rewards
  fastify.post('/rewards/redeem', {
    preHandler: [requireVerified],
  }, async (request) => {
    const { amountCents } = request.body;
    return redeemRewards(request.user.user_id, amountCents, 'cover_offset');
  });

  // Manual payout trigger (platform admin only)
  fastify.post('/admin/trigger-payout', {
    preHandler: [requirePlatformAdmin],
  }, async () => {
    return triggerManualPayout();
  });
}
