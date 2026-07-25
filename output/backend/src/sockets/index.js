/**
 * Socket.io Server Setup
 *
 * Rooms:
 *   user:{userId}         — private channel for a specific user (notifications, timer, alerts)
 *   business:{businessId} — shared room for all staff at a business + live queue observers
 *
 * Socket Events Emitted by Server:
 *   queue:updated          → { businessId }                       — queue state changed, clients should re-fetch
 *   queue:timer_start      → { entryId, businessId, seconds, startedAt }
 *   queue:timer_expired    → { businessId, message, scoreDock }
 *   queue:admitted         → { businessId, message, newScore }
 *   queue:removed          → { businessId, message, scoreDock }
 *   occupancy:update       → { businessId, occupancy }
 *   ban:geofence_alert     → { businessId, businessName, userId, userName, photoUrl, score, banReason, timestamp }
 *   ban:entry_warning      → { businessId, businessName, message }
 *   ban:issued             → { businessId, reason, isRedFlagged, message }
 *   ban:lifted             → { businessId, message }
 *   booking:no_show        → { bookingId, message, scoreDock }
 *   booking:checked_in     → { bookingId }
 *
 * Socket Events Received from Clients:
 *   join:user_room         → { userId }   — authenticated user joins their private room
 *   join:business_room     → { businessId } — staff/admin joins business room
 *   leave:business_room    → { businessId }
 */

import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { redis, redisSub } from '../redis/client.js';
import { setSocketIO } from '../services/timerService.js';

export function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: [process.env.FRONTEND_URL, process.env.ADMIN_URL],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Redis adapter enables multi-instance pub/sub fanout
  io.adapter(createAdapter(redis, redisSub));

  // Inject io into timer service so workers can emit events
  setSocketIO(io);

  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // ── User joins their private room ──────────────────────────────────────
    socket.on('join:user_room', ({ userId }) => {
      if (!userId) return;
      socket.join(`user:${userId}`);
      console.log(`[Socket] User ${userId} joined their room`);
    });

    // ── Staff/observer joins a business room ───────────────────────────────
    socket.on('join:business_room', ({ businessId }) => {
      if (!businessId) return;
      socket.join(`business:${businessId}`);
      console.log(`[Socket] Socket ${socket.id} joined business room ${businessId}`);
    });

    socket.on('leave:business_room', ({ businessId }) => {
      socket.leave(`business:${businessId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}
