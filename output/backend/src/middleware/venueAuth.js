/**
 * Business (Venue) Auth Middleware
 *
 * Verifies that the authenticated user is staff or admin at a specific business.
 * Reads businessId from request.params.businessId by default.
 */

import { query } from '../db/client.js';
import { requireAuth } from './auth.js';

/**
 * Require the user to be staff or admin at the business in params.businessId.
 * Also allows platform_admin.
 */
export async function requireBusinessStaff(request, reply) {
  await requireAuth(request, reply);
  if (reply.sent) return;

  const { user_id, role } = request.user;
  if (role === 'platform_admin') return; // Platform admins have full access

  const businessId = request.params.businessId || request.body?.businessId;
  if (!businessId) {
    return reply.code(400).send({ error: 'businessId is required' });
  }

  const { rows } = await query(`
    SELECT role FROM business_staff
    WHERE business_id = $1 AND user_id = $2
  `, [businessId, user_id]);

  if (!rows[0]) {
    return reply.code(403).send({
      error: 'Forbidden',
      message: 'You do not have staff access to this business',
    });
  }

  // Attach staff role to request for downstream use
  request.staffRole = rows[0].role;
}

/**
 * Require business ADMIN role (for settings changes, staff management).
 */
export async function requireBusinessAdmin(request, reply) {
  await requireBusinessStaff(request, reply);
  if (reply.sent) return;

  if (request.user.role !== 'platform_admin' && request.staffRole !== 'admin') {
    reply.code(403).send({
      error: 'Forbidden',
      message: 'Business admin access required',
    });
  }
}
