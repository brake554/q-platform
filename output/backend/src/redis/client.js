import { Redis } from 'ioredis';
import 'dotenv/config';

// Primary client — used for commands
export const redis = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
});

// Duplicate client — required for BullMQ subscriber / pub-sub
export const redisSub = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 3,
});

redis.on('error', (err) => console.error('[Redis] Error:', err));
redis.on('connect', () => console.log('[Redis] Connected'));

// ─── Queue key helpers ────────────────────────────────────────────────────────

/** Sorted set key for a business queue.  Score = join timestamp (ms). */
export const QUEUE_KEY = (businessId) => `q:business:${businessId}:queue`;

/** Occupancy counter key */
export const OCCUPANCY_KEY = (businessId) => `q:business:${businessId}:occupancy`;

/** Active timer job ID for a user at a business */
export const TIMER_KEY = (businessId, userId) => `q:timer:${businessId}:${userId}`;

/** Geo positions of online users — sorted set with geo commands */
export const USER_GEO_KEY = 'q:user_positions';

export default redis;
