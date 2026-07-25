/**
 * Queue Routes
 * POST   /api/queues/:businessId/join
 * DELETE /api/queues/:businessId/leave
 * GET    /api/queues/:businessId/active
 * GET    /api/queues/:businessId/position
 * POST   /api/queues/:businessId/admit/:entryId
 * POST   /api/queues/:businessId/remove/:entryId
 * POST   /api/queues/:businessId/confirm-entry
 */

import {
  joinQueue,
  leaveQueue,
  getQueueState,
  getUserPosition,
  admitEntry,
  removeFromQueue,
  confirmEntry,
} from '../services/queueService.js';
import { requireVerified, requireAuth } from '../middleware/auth.js';
import { requireBusinessStaff } from '../middleware/venueAuth.js';

export default async function queueRoutes(fastify) {
  const { io } = fastify;

  // Join queue
  fastify.post('/:businessId/join', {
    preHandler: [requireVerified],
  }, async (request, reply) => {
    const { businessId } = request.params;
    const { partySize = 1 } = request.body || {};
    const userId = request.user.user_id;

    const result = await joinQueue(userId, businessId, partySize);

    io.to(`business:${businessId}`).emit('queue:updated', { businessId });

    return reply.code(201).send(result);
  });

  // Leave queue voluntarily
  fastify.delete('/:businessId/leave', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { businessId } = request.params;
    await leaveQueue(request.user.user_id, businessId);

    io.to(`business:${businessId}`).emit('queue:updated', { businessId });

    return { success: true };
  });

  // Get full queue state (for staff and public queue display)
  fastify.get('/:businessId/active', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const entries = await getQueueState(request.params.businessId);
    return { entries };
  });

  // Get current user's position
  fastify.get('/:businessId/position', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const position = await getUserPosition(request.user.user_id, request.params.businessId);
    if (!position) return reply.code(404).send({ error: 'Not in queue' });
    return position;
  });

  // Staff: admit a user (starts their countdown timer)
  fastify.post('/:businessId/admit/:entryId', {
    preHandler: [requireBusinessStaff],
  }, async (request, reply) => {
    const result = await admitEntry(request.params.entryId, io);
    return result;
  });

  // Staff: remove a user from the queue
  fastify.post('/:businessId/remove/:entryId', {
    preHandler: [requireBusinessStaff],
  }, async (request, reply) => {
    await removeFromQueue(request.params.entryId, request.user.user_id, io);
    return { success: true };
  });

  // User confirms entry during timer window (swipe-to-confirm)
  fastify.post('/:businessId/confirm-entry', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const result = await confirmEntry(request.user.user_id, request.params.businessId, io);
    return result;
  });
}
