/**
 * Auth Middleware
 *
 * Fastify preHandler hooks for JWT verification.
 * JWT payload: { user_id, role, is_verified, score, iat, exp }
 */

import { query } from '../db/client.js';

/**
 * Require a valid JWT access token.
 * Attaches decoded payload to request.user.
 */
export async function requireAuth(request, reply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.code(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
  }
}

/**
 * Require the user to be verified (selfie + ID approved by platform admin).
 */
export async function requireVerified(request, reply) {
  await requireAuth(request, reply);
  if (!request.user?.is_verified) {
    reply.code(403).send({
      error: 'Forbidden',
      message: 'Your account is pending verification. Please wait for approval.',
    });
  }
}

/**
 * Require platform_admin role.
 */
export async function requirePlatformAdmin(request, reply) {
  await requireAuth(request, reply);
  if (request.user?.role !== 'platform_admin') {
    reply.code(403).send({ error: 'Forbidden', message: 'Platform admin access required' });
  }
}

/**
 * Require the requesting user to be the owner of the resource or a platform admin.
 * Usage: pass resourceUserId from the route params/body.
 */
export function requireSelfOrAdmin(getUserId) {
  return async function (request, reply) {
    await requireAuth(request, reply);
    const targetId = getUserId(request);
    if (request.user.user_id !== targetId && request.user.role !== 'platform_admin') {
      reply.code(403).send({ error: 'Forbidden', message: 'Access denied' });
    }
  };
}

/**
 * Middleware to optionally attach user info even if no token is present.
 * Used for public endpoints that show extra info when authenticated.
 */
export async function optionalAuth(request, _reply) {
  try {
    await request.jwtVerify();
  } catch {
    // Not authenticated — request.user will be undefined
  }
}
