/**
 * Rewards & Bans Routes
 *
 * POST /api/bans
 * GET  /api/bans/business/:businessId
 * GET  /api/bans/user/:userId
 * DELETE /api/bans/:id
 *
 * POST /api/rewards/ad-impression  (internal — called by ad serving)
 */

import { query } from '../db/client.js';
import { requireAuth } from '../middleware/auth.js';
import { requireBusinessStaff, requireBusinessAdmin } from '../middleware/venueAuth.js';
import { issueBan, liftBan, getBansForBusiness } from '../services/banService.js';

export default async function rewardBanRoutes(fastify) {
  const { io } = fastify;

  // ── Bans ──────────────────────────────────────────────────────────────────

  // Issue ban
  fastify.post('/bans', {
    preHandler: [requireBusinessStaff],
  }, async (request, reply) => {
    const { userId, businessId, reason } = request.body;
    const result = await issueBan(userId, businessId, reason, request.user.user_id, io);
    return reply.code(201).send(result);
  });

  // Business bans list
  fastify.get('/bans/business/:businessId', {
    preHandler: [requireBusinessStaff],
  }, async (request) => {
    const bans = await getBansForBusiness(request.params.businessId);
    return { bans };
  });

  // User bans (own or staff)
  fastify.get('/bans/user/:userId', {
    preHandler: [requireAuth],
  }, async (request) => {
    const { rows } = await query(`
      SELECT b.*, bus.name AS business_name, bus.category
      FROM bans b JOIN businesses bus ON bus.id = b.business_id
      WHERE b.user_id = $1
      ORDER BY b.issued_at DESC
    `, [request.params.userId]);
    return { bans: rows };
  });

  // Lift ban — must verify the ban belongs to a business this staff member administers
  fastify.delete('/bans/:id', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    // Fetch the ban to get its business_id, then verify staff access
    const { rows } = await query('SELECT business_id FROM bans WHERE id = $1', [request.params.id]);
    if (!rows[0]) return reply.code(404).send({ error: 'Ban not found' });

    // Inject business_id into params so requireBusinessAdmin middleware can use it
    request.params.businessId = rows[0].business_id;
    await requireBusinessAdmin(request, reply);
    if (reply.sent) return;

    const result = await liftBan(request.params.id, request.user.user_id, io);
    return result;
  });

  // ── Ad Impressions / Rewards ───────────────────────────────────────────────

  // Record ad impression and credit user
  fastify.post('/rewards/ad-impression', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { adId, businessId } = request.body;
    const userId = request.user.user_id;

    // Get ad CPM and calculate per-impression reward (CPM / 1000 * user_share_pct)
    const { rows: adRows } = await query(
      'SELECT cpm_cents, budget_cents, spent_cents FROM ads WHERE id = $1 AND is_active = TRUE',
      [adId]
    );
    if (!adRows[0]) return reply.code(404).send({ error: 'Ad not found' });

    const ad = adRows[0];
    if (ad.spent_cents >= ad.budget_cents) {
      return reply.code(400).send({ error: 'Ad budget exhausted' });
    }

    // 20% of CPM per impression goes to user as reward (platform decision)
    const rewardCents = Math.floor(ad.cpm_cents / 1000 * 0.20);

    // Deduct from ad budget
    await query(
      'UPDATE ads SET spent_cents = spent_cents + $2 WHERE id = $1',
      [adId, Math.floor(ad.cpm_cents / 1000)]
    );

    // Record impression
    await query(`
      INSERT INTO ad_impressions (ad_id, user_id, business_id, reward_cents)
      VALUES ($1, $2, $3, $4)
    `, [adId, userId, businessId || null, rewardCents]);

    if (rewardCents > 0) {
      // Credit reward balance
      const { rows } = await query(`
        INSERT INTO reward_credits (user_id, balance_cents)
        VALUES ($1, $2)
        ON CONFLICT (user_id) DO UPDATE
          SET balance_cents = reward_credits.balance_cents + $2,
              updated_at    = NOW()
        RETURNING balance_cents
      `, [userId, rewardCents]);

      await query(`
        INSERT INTO reward_transactions (user_id, delta_cents, reason, balance_after)
        VALUES ($1, $2, 'ad_revenue_share', $3)
      `, [userId, rewardCents, rows[0].balance_cents]);
    }

    return { credited: rewardCents };
  });

  // Redeem reward credits toward an upcoming payment
  fastify.post('/rewards/redeem', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { amountCents } = request.body;
    const userId = request.user.user_id;

    const { rows } = await query(`
      UPDATE reward_credits
      SET balance_cents = balance_cents - $2,
          updated_at    = NOW()
      WHERE user_id = $1 AND balance_cents >= $2
      RETURNING balance_cents
    `, [userId, amountCents]);

    if (!rows[0]) {
      return reply.code(400).send({ error: 'Insufficient reward balance' });
    }

    await query(`
      INSERT INTO reward_transactions (user_id, delta_cents, reason, balance_after)
      VALUES ($1, $2, 'cover_offset', $3)
    `, [userId, -amountCents, rows[0].balance_cents]);

    return { remaining_balance: rows[0].balance_cents };
  });
}
