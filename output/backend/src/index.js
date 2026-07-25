/**
 * Q Platform — Fastify API Server
 *
 * Registers all plugins, routes, and starts the HTTP + Socket.io server.
 */

import 'dotenv/config';
import { createServer } from 'http';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyMultipart from '@fastify/multipart';
import { redis } from './redis/client.js';
import { createSocketServer } from './sockets/index.js';
import { startWorkers } from './services/timerService.js';

// ── Route imports ─────────────────────────────────────────────────────────────
import queueRoutes from './routes/queue.js';
import businessRoutes from './routes/venue.js';
import userRoutes from './routes/users.js';
import bookingRoutes from './routes/bookings.js';
import rewardBanRoutes from './routes/rewards.js';

const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
  },
});

// ── Plugins ───────────────────────────────────────────────────────────────────

await fastify.register(fastifyCors, {
  origin: [process.env.FRONTEND_URL, process.env.ADMIN_URL],
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
});

await fastify.register(fastifyHelmet, {
  contentSecurityPolicy: false, // Handled by nginx in production
});

await fastify.register(fastifyCookie, {
  secret: process.env.JWT_REFRESH_SECRET,
});

await fastify.register(fastifyJwt, {
  secret: process.env.JWT_SECRET,
  cookie: { cookieName: 'refreshToken', signed: false },
});

await fastify.register(fastifyRateLimit, {
  max: 100,
  timeWindow: '1 minute',
  redis,
});

await fastify.register(fastifyMultipart, {
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB for ID/selfie uploads
});

// ── Raw body parser for Stripe webhook signature verification ─────────────────
// Must run BEFORE the default JSON parser to capture the raw bytes Stripe signs.
fastify.addContentTypeParser(
  'application/json',
  { parseAs: 'buffer' },
  function stripeWebhookBodyParser(req, body, done) {
    // Only store rawBody for the webhook route; parse normally for all others
    if (req.routeOptions?.url === '/api/payments/webhook') {
      req.rawBody = body;
      try {
        done(null, JSON.parse(body.toString('utf8')));
      } catch (err) {
        done(err);
      }
    } else {
      try {
        done(null, JSON.parse(body.toString('utf8')));
      } catch (err) {
        done(err);
      }
    }
  }
);

// ── HTTP server + Socket.io ───────────────────────────────────────────────────

const httpServer = createServer(fastify.server);
const io = createSocketServer(httpServer);

// Decorate fastify with io so routes can emit events
fastify.decorate('io', io);

// ── Routes ────────────────────────────────────────────────────────────────────

fastify.register(queueRoutes, { prefix: '/api/queues' });
fastify.register(businessRoutes, { prefix: '/api/businesses' });
fastify.register(userRoutes, { prefix: '/api/users' });
fastify.register(bookingRoutes, { prefix: '/api/bookings' });
fastify.register(rewardBanRoutes, { prefix: '/api' });

// Geo endpoints (subset of business routes)
fastify.get('/api/geo/businesses/nearby', async (request) => {
  const { lat, lng, radius = 5, category } = request.query;
  const { getBusinessesNearby } = await import('./services/geoService.js');
  return getBusinessesNearby(parseFloat(lat), parseFloat(lng), parseFloat(radius), category || null);
});

fastify.post('/api/geo/checkin', {
  preHandler: [async (req, rep) => {
    const { requireAuth } = await import('./middleware/auth.js');
    await requireAuth(req, rep);
  }],
}, async (request) => {
  const { lat, lng } = request.body;
  const { updateUserPosition } = await import('./services/geoService.js');
  return updateUserPosition(request.user.user_id, parseFloat(lat), parseFloat(lng), io);
});

// Health check
fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

// ── Global error handler ──────────────────────────────────────────────────────

fastify.setErrorHandler((error, request, reply) => {
  // Known operational errors (validation, business logic)
  if (error.statusCode && error.statusCode < 500) {
    return reply.code(error.statusCode).send({ error: error.message });
  }
  // Unknown errors — don't leak internals
  fastify.log.error(error);
  reply.code(500).send({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3001', 10);

try {
  // Initialize BullMQ workers
  startWorkers();

  // Fastify must listen first, then attach httpServer to Socket.io
  await fastify.listen({ port: PORT, host: '0.0.0.0' });

  // Socket.io attaches to the same HTTP server
  httpServer.listen(0); // No-op — already bound via fastify.listen

  console.log(`[Q API] Server running on port ${PORT}`);
  console.log(`[Q API] Environment: ${process.env.NODE_ENV}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
