/**
 * Session Service
 *
 * Issues and rotates JWT access + refresh tokens.
 * Refresh tokens are stored as httpOnly cookies.
 * Active refresh tokens are tracked in Redis to enable revocation.
 */

import { redis } from '../../../../backend/src/redis/client.js';

const ACCESS_EXPIRES_IN  = process.env.JWT_ACCESS_EXPIRES_IN  || '15m';
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

// Redis key for refresh token validity tracking
const REFRESH_KEY = (userId, tokenId) => `q:refresh:${userId}:${tokenId}`;

/**
 * Issue an access token + set refresh token cookie.
 *
 * JWT payload: { user_id, role, is_verified, score }
 *
 * @param {object} fastify - Fastify instance (for fastify.jwt.sign)
 * @param {object} reply - Fastify reply (for cookie)
 * @param {object} user - User row from DB
 * @param {number} score - Current behavior score
 * @returns {{ accessToken: string }}
 */
export async function issueTokens(fastify, reply, user, score = 100) {
  const payload = {
    user_id:      user.id,
    role:         user.role,
    is_verified:  user.is_verified,
    score,
  };

  const accessToken = fastify.jwt.sign(payload, { expiresIn: ACCESS_EXPIRES_IN });

  // Refresh token includes a unique jti for revocation
  const { randomUUID } = await import('crypto');
  const tokenId = randomUUID();
  const refreshPayload = { user_id: user.id, jti: tokenId, type: 'refresh' };
  const refreshToken = fastify.jwt.sign(refreshPayload, {
    expiresIn: REFRESH_EXPIRES_IN,
    secret: process.env.JWT_REFRESH_SECRET,
  });

  // Store token ID in Redis with 30d TTL for revocation checking
  const ttl = 30 * 24 * 60 * 60; // 30 days in seconds
  await redis.set(REFRESH_KEY(user.id, tokenId), '1', 'EX', ttl);

  // Set httpOnly cookie
  reply.setCookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/api/auth/refresh',
    maxAge: ttl,
  });

  return { accessToken };
}

/**
 * Rotate refresh token: validate old one, issue new one.
 * @param {object} fastify
 * @param {object} reply
 * @param {string} refreshToken
 * @returns {{ accessToken: string, user: object }}
 */
export async function rotateRefreshToken(fastify, reply, refreshToken) {
  let decoded;
  try {
    decoded = fastify.jwt.verify(refreshToken, { secret: process.env.JWT_REFRESH_SECRET });
  } catch {
    throw new Error('Invalid or expired refresh token');
  }

  if (decoded.type !== 'refresh') throw new Error('Not a refresh token');

  // Check revocation
  const valid = await redis.get(REFRESH_KEY(decoded.user_id, decoded.jti));
  if (!valid) throw new Error('Refresh token has been revoked');

  // Revoke the old token
  await redis.del(REFRESH_KEY(decoded.user_id, decoded.jti));

  return decoded.user_id;
}

/**
 * Revoke all active refresh tokens for a user (logout from all devices).
 * @param {string} userId
 */
export async function revokeAllTokens(userId) {
  const keys = await redis.keys(`q:refresh:${userId}:*`);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

/**
 * Revoke a single refresh token by jti.
 * @param {string} userId
 * @param {string} tokenId
 */
export async function revokeToken(userId, tokenId) {
  await redis.del(REFRESH_KEY(userId, tokenId));
}
