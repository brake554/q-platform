/**
 * Auth Routes
 *
 * POST /api/auth/register          — Step 1: email+phone+password+DOB
 * POST /api/auth/verify-otp        — Step 2: phone OTP
 * POST /api/auth/upload-id         — Step 3: selfie + ID doc upload
 * POST /api/auth/login             — Login, return access token + set refresh cookie
 * POST /api/auth/refresh           — Rotate refresh token
 * POST /api/auth/logout            — Revoke refresh token
 * GET  /api/auth/me                — Current user profile
 * POST /api/auth/venue/login       — Venue staff login
 *
 * Rate limiting: 5 login attempts per 15 min (configured in Fastify plugin).
 */

import { registerSchema, loginSchema, otpVerifySchema, staffLoginSchema } from '../utils/validators.js';
import {
  registerUser,
  verifyPhone,
  loginUser,
  loginStaff,
  storeVerificationKeys,
} from '../services/authService.js';
import { uploadVerificationImage } from '../services/verificationService.js';
import { issueTokens, rotateRefreshToken, revokeAllTokens } from '../services/sessionService.js';
import { query } from '../../../backend/src/db/client.js';

export default async function authRoutes(fastify) {
  // ── Registration: Step 1 ──────────────────────────────────────────────────
  fastify.post('/register', {
    schema: registerSchema,
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const result = await registerUser(request.body);
    return reply.code(201).send({
      userId: result.userId,
      message: 'Account created. Check your phone for a verification code.',
      nextStep: 'verify-otp',
    });
  });

  // ── Registration: Step 2 — OTP ────────────────────────────────────────────
  fastify.post('/verify-otp', {
    schema: otpVerifySchema,
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const { phone, code } = request.body;
    const { userId } = await verifyPhone(phone, code);
    return {
      userId,
      message: 'Phone verified. Please upload your ID and a selfie.',
      nextStep: 'upload-id',
    };
  });

  // ── Registration: Step 3 — ID + selfie upload ─────────────────────────────
  fastify.post('/upload-id', {
    preHandler: [async (request, reply) => {
      // Must be logged in (but not yet verified)
      try { await request.jwtVerify(); } catch {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
    }],
  }, async (request, reply) => {
    const userId = request.user.user_id;
    const parts = request.parts();

    let selfieKey = null;
    let idDocKey = null;

    for await (const part of parts) {
      if (part.type === 'file') {
        const chunks = [];
        for await (const chunk of part.file) chunks.push(chunk);
        const buffer = Buffer.concat(chunks);

        if (part.fieldname === 'selfie') {
          selfieKey = await uploadVerificationImage(buffer, part.mimetype, 'selfie', userId);
        } else if (part.fieldname === 'id_doc') {
          idDocKey = await uploadVerificationImage(buffer, part.mimetype, 'id_doc', userId);
        }
      }
    }

    if (!selfieKey || !idDocKey) {
      return reply.code(400).send({ error: 'Both selfie and id_doc files are required' });
    }

    await storeVerificationKeys(userId, selfieKey, idDocKey);

    return {
      message: 'Documents submitted. Your account is pending admin review. You will be notified when approved.',
      status: 'pending_review',
    };
  });

  // ── Login ─────────────────────────────────────────────────────────────────
  fastify.post('/login', {
    schema: loginSchema,
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const { email, password } = request.body;
    const user = await loginUser(email, password);
    const { accessToken } = await issueTokens(fastify, reply, user, user.score);

    return {
      accessToken,
      user: {
        id:           user.id,
        email:        user.email,
        full_name:    user.full_name,
        role:         user.role,
        is_verified:  user.is_verified,
        score:        user.score,
      },
    };
  });

  // ── Token refresh ─────────────────────────────────────────────────────────
  fastify.post('/refresh', async (request, reply) => {
    const refreshToken = request.cookies?.refreshToken;
    if (!refreshToken) {
      return reply.code(401).send({ error: 'No refresh token' });
    }

    const userId = await rotateRefreshToken(fastify, reply, refreshToken);

    // Re-fetch user to get fresh claims (score may have changed)
    const { rows } = await query(`
      SELECT u.*, COALESCE(bs.score, 100) AS score
      FROM users u
      LEFT JOIN behavior_scores bs ON bs.user_id = u.id
      WHERE u.id = $1
    `, [userId]);

    if (!rows[0]) return reply.code(401).send({ error: 'User not found' });

    const { accessToken } = await issueTokens(fastify, reply, rows[0], rows[0].score);
    return { accessToken };
  });

  // ── Logout ────────────────────────────────────────────────────────────────
  fastify.post('/logout', {
    preHandler: [async (req, rep) => {
      try { await req.jwtVerify(); } catch {
        return rep.code(401).send({ error: 'Unauthorized' });
      }
    }],
  }, async (request, reply) => {
    await revokeAllTokens(request.user.user_id);
    reply.clearCookie('refreshToken', { path: '/api/auth/refresh' });
    return { success: true };
  });

  // ── Current user ─────────────────────────────────────────────────────────
  fastify.get('/me', {
    preHandler: [async (req, rep) => {
      try { await req.jwtVerify(); } catch {
        return rep.code(401).send({ error: 'Unauthorized' });
      }
    }],
  }, async (request, reply) => {
    const { rows } = await query(`
      SELECT
        u.id, u.email, u.phone, u.full_name, u.date_of_birth,
        u.role, u.is_verified, u.profile_photo_url, u.created_at,
        COALESCE(bs.score, 100) AS score,
        COALESCE(rc.balance_cents, 0) AS reward_balance_cents,
        COALESCE(rf.is_active, FALSE) AS is_red_flagged
      FROM users u
      LEFT JOIN behavior_scores bs ON bs.user_id = u.id
      LEFT JOIN reward_credits rc ON rc.user_id = u.id
      LEFT JOIN red_flags rf ON rf.user_id = u.id AND rf.is_active = TRUE
      WHERE u.id = $1
    `, [request.user.user_id]);

    if (!rows[0]) return reply.code(404).send({ error: 'User not found' });

    // Explicitly strip PII keys that must not be returned
    const { selfie_key, id_doc_key, password_hash, ...safeUser } = rows[0];
    return safeUser;
  });

  // ── Venue/business staff login ────────────────────────────────────────────
  fastify.post('/venue/login', {
    schema: staffLoginSchema,
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const { email, password, business_id } = request.body;
    const { user, staffRole } = await loginStaff(email, password, business_id);

    // Override role claim with staff role for this business context
    const staffUser = {
      ...user,
      role: user.role === 'platform_admin' ? 'platform_admin' : `business_${staffRole}`,
    };

    const { accessToken } = await issueTokens(fastify, reply, staffUser, user.score);

    return {
      accessToken,
      user: {
        id:          user.id,
        full_name:   user.full_name,
        role:        staffUser.role,
        business_id,
        staff_role:  staffRole,
      },
    };
  });
}
