/**
 * User Routes
 * GET    /api/users/search          — Staff: search by phone (returns safe profile only)
 * GET    /api/users/:id
 * PATCH  /api/users/:id
 * GET    /api/users/:id/score
 * GET    /api/users/:id/rewards
 * GET    /api/users/:id/visits
 * GET    /api/users/:id/bans
 *
 * Platform admin:
 * GET    /api/admin/users/pending
 * POST   /api/admin/users/:id/approve
 * POST   /api/admin/users/:id/reject
 * GET    /api/admin/red-flags
 */

import { query } from '../db/client.js';
import { requireAuth, requirePlatformAdmin, requireSelfOrAdmin } from '../middleware/auth.js';
import { requireBusinessStaff } from '../middleware/venueAuth.js';
import { getScoreHistory } from '../services/scoringService.js';
import { getActiveBans } from '../services/banService.js';

export default async function userRoutes(fastify) {
  // Staff: search user by phone number — returns safe profile only (no email/password)
  // Must be registered BEFORE /:id to avoid treating "search" as a UUID
  fastify.get('/search', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { phone, name } = request.query;
    if (!phone && !name) return reply.code(400).send({ error: 'phone or name query required' });

    const params = [];
    const conditions = [];
    if (phone) { params.push(`%${phone.replace(/\D/g, '')}%`); conditions.push(`REPLACE(REPLACE(u.phone, '+', ''), '-', '') LIKE $${params.length}`); }
    if (name)  { params.push(`%${name}%`); conditions.push(`u.full_name ILIKE $${params.length}`); }

    const { rows } = await query(`
      SELECT u.id, u.full_name, u.profile_photo_url,
             COALESCE(bs.score, 100) AS score,
             COALESCE(rf.is_active, FALSE) AS is_red_flagged
      FROM users u
      LEFT JOIN behavior_scores bs ON bs.user_id = u.id
      LEFT JOIN red_flags rf ON rf.user_id = u.id AND rf.is_active = TRUE
      WHERE ${conditions.join(' AND ')}
      LIMIT 10
    `, params);

    return { users: rows };
  });

  // Public user profile (score + red flag status; no PII like email/phone)
  fastify.get('/:id', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { rows } = await query(`
      SELECT
        u.id, u.full_name, u.profile_photo_url, u.created_at,
        COALESCE(bs.score, 100) AS score,
        COALESCE(rf.is_active, FALSE) AS is_red_flagged
      FROM users u
      LEFT JOIN behavior_scores bs ON bs.user_id = u.id
      LEFT JOIN red_flags rf ON rf.user_id = u.id AND rf.is_active = TRUE
      WHERE u.id = $1
    `, [request.params.id]);
    if (!rows[0]) return reply.code(404).send({ error: 'User not found' });
    return rows[0];
  });

  // Update own profile
  fastify.patch('/:id', {
    preHandler: [requireSelfOrAdmin((r) => r.params.id)],
  }, async (request, reply) => {
    const { full_name, profile_photo_url } = request.body;
    await query(`
      UPDATE users
      SET full_name         = COALESCE($2, full_name),
          profile_photo_url = COALESCE($3, profile_photo_url),
          updated_at        = NOW()
      WHERE id = $1
    `, [request.params.id, full_name, profile_photo_url]);
    return { success: true };
  });

  // Score + history (own or staff)
  fastify.get('/:id/score', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { rows } = await query(`
      SELECT score, last_infraction_at, last_clean_visit_at
      FROM behavior_scores WHERE user_id = $1
    `, [request.params.id]);
    const score = rows[0] || { score: 100, last_infraction_at: null, last_clean_visit_at: null };
    const history = await getScoreHistory(request.params.id);
    return { ...score, history };
  });

  // Reward balance (own only)
  fastify.get('/:id/rewards', {
    preHandler: [requireSelfOrAdmin((r) => r.params.id)],
  }, async (request, reply) => {
    const { rows: credit } = await query(
      'SELECT balance_cents FROM reward_credits WHERE user_id = $1',
      [request.params.id]
    );
    const { rows: txns } = await query(`
      SELECT delta_cents, reason, balance_after, created_at
      FROM reward_transactions WHERE user_id = $1
      ORDER BY created_at DESC LIMIT 50
    `, [request.params.id]);
    return { balance_cents: credit[0]?.balance_cents ?? 0, transactions: txns };
  });

  // Visit history (own only)
  fastify.get('/:id/visits', {
    preHandler: [requireSelfOrAdmin((r) => r.params.id)],
  }, async (request, reply) => {
    const { rows } = await query(`
      SELECT qe.admitted_at, b.name AS business_name, b.city, b.category
      FROM queue_entries qe
      JOIN queues q ON q.id = qe.queue_id
      JOIN businesses b ON b.id = q.business_id
      WHERE qe.user_id = $1 AND qe.status = 'admitted'
      ORDER BY qe.admitted_at DESC
      LIMIT 100
    `, [request.params.id]);
    return { visits: rows };
  });

  // Bans list (own or staff)
  fastify.get('/:id/bans', {
    preHandler: [requireAuth],
  }, async (request) => {
    const bans = await getActiveBans(request.params.id);
    return { bans };
  });

  // ── Platform Admin ─────────────────────────────────────────────────────────

  fastify.get('/pending', {
    preHandler: [requirePlatformAdmin],
  }, async () => {
    const { rows } = await query(`
      SELECT id, full_name, email, phone, date_of_birth, created_at
      FROM users
      WHERE is_verified = FALSE AND is_suspended = FALSE
        AND selfie_key IS NOT NULL AND id_doc_key IS NOT NULL
      ORDER BY created_at ASC
    `);
    return { pending: rows };
  });

  fastify.post('/:id/approve', {
    preHandler: [requirePlatformAdmin],
  }, async (request, reply) => {
    await query(`
      UPDATE users SET is_verified = TRUE, updated_at = NOW() WHERE id = $1
    `, [request.params.id]);
    return { success: true };
  });

  fastify.post('/:id/reject', {
    preHandler: [requirePlatformAdmin],
  }, async (request, reply) => {
    await query(`
      UPDATE users
      SET selfie_key = NULL, id_doc_key = NULL, updated_at = NOW()
      WHERE id = $1
    `, [request.params.id]);
    return { success: true };
  });

  fastify.get('/red-flags', {
    preHandler: [requirePlatformAdmin],
  }, async () => {
    const { rows } = await query(`
      SELECT rf.*, u.full_name, u.email, COALESCE(bs.score, 100) AS score
      FROM red_flags rf
      JOIN users u ON u.id = rf.user_id
      LEFT JOIN behavior_scores bs ON bs.user_id = rf.user_id
      WHERE rf.is_active = TRUE
      ORDER BY rf.ban_count DESC
    `);
    return { red_flags: rows };
  });
}
