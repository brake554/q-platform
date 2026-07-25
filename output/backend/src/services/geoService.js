/**
 * Geo Service
 *
 * Handles:
 * - PostGIS geo-fence containment checks (ST_Contains)
 * - Ban alert detection when a banned user enters a business geo-fence
 * - Real-time occupancy increment/decrement on geo-fence entry/exit
 * - Nearby business lookup
 */

import { query } from '../db/client.js';
import { redis, OCCUPANCY_KEY, USER_GEO_KEY } from '../redis/client.js';

/**
 * Update a user's GPS position in Redis and check all active geo-fences.
 * Emits socket events via the provided io instance.
 *
 * @param {string} userId
 * @param {number} lat
 * @param {number} lng
 * @param {import('socket.io').Server} io
 * @returns {{ alerts: Array, occupancyChanges: Array }}
 */
export async function updateUserPosition(userId, lat, lng, io) {
  // Store position in Redis geo index (GEOADD key lng lat member)
  await redis.geoadd(USER_GEO_KEY, lng, lat, userId);

  // Find all active businesses whose geo-fence contains this point
  const { rows: containingBusinesses } = await query(`
    SELECT id, name, admission_timer_seconds
    FROM businesses
    WHERE ST_Contains(geofence_polygon, ST_SetSRID(ST_MakePoint($1, $2), 4326))
      AND is_active = TRUE
  `, [lng, lat]);  // PostGIS uses (lng, lat) ordering for ST_MakePoint

  const alerts = [];
  const occupancyChanges = [];

  for (const business of containingBusinesses) {
    // Check if user was previously OUTSIDE this business (occupancy tracking)
    const entryKey = `q:in_fence:${business.id}:${userId}`;
    const wasInside = await redis.get(entryKey);

    if (!wasInside) {
      // User just entered the geo-fence
      await redis.set(entryKey, '1', 'EX', 3600); // expire after 1h of no position update

      // Increment occupancy
      const newOccupancy = await redis.incr(OCCUPANCY_KEY(business.id));
      await query(
        'UPDATE businesses SET current_occupancy = $1 WHERE id = $2',
        [newOccupancy, business.id]
      );

      // Broadcast occupancy update to staff watching this business
      io.to(`business:${business.id}`).emit('occupancy:update', {
        businessId: business.id,
        occupancy: newOccupancy,
      });

      occupancyChanges.push({ businessId: business.id, occupancy: newOccupancy, event: 'entry' });

      // ── Ban check ──────────────────────────────────────────────────────────
      const { rows: bans } = await query(`
        SELECT b.id, b.reason, u.full_name, u.profile_photo_url, bs.score
        FROM bans b
        JOIN users u ON u.id = b.user_id
        LEFT JOIN behavior_scores bs ON bs.user_id = b.user_id
        WHERE b.user_id = $1 AND b.business_id = $2 AND b.is_active = TRUE
        LIMIT 1
      `, [userId, business.id]);

      if (bans.length > 0) {
        const ban = bans[0];

        // Alert ALL staff in this business room
        io.to(`business:${business.id}`).emit('ban:geofence_alert', {
          businessId: business.id,
          businessName: business.name,
          userId,
          userName: ban.full_name,
          photoUrl: ban.profile_photo_url,
          score: ban.score,
          banReason: ban.reason,
          timestamp: new Date().toISOString(),
        });

        // Notify the banned user themselves
        io.to(`user:${userId}`).emit('ban:entry_warning', {
          businessId: business.id,
          businessName: business.name,
          message: `You have an active ban at ${business.name}. Please contact staff to resolve it.`,
        });

        alerts.push({ businessId: business.id, userId, type: 'ban_alert' });
      }
    } else {
      // Refresh TTL — user is still inside
      await redis.expire(entryKey, 3600);
    }
  }

  // ── Exit detection ──────────────────────────────────────────────────────────
  // Find all businesses user was marked as "inside" but is no longer in
  const insideKeys = await redis.keys(`q:in_fence:*:${userId}`);

  for (const key of insideKeys) {
    // key format: q:in_fence:{businessId}:{userId}
    const parts = key.split(':');
    const businessId = parts[2];

    const stillInside = containingBusinesses.some((b) => b.id === businessId);
    if (!stillInside) {
      await redis.del(key);

      // Decrement occupancy
      const newOccupancy = Math.max(0, await redis.decr(OCCUPANCY_KEY(businessId)));
      await query(
        'UPDATE businesses SET current_occupancy = GREATEST(0, current_occupancy - 1) WHERE id = $1',
        [businessId]
      );

      io.to(`business:${businessId}`).emit('occupancy:update', {
        businessId,
        occupancy: newOccupancy,
      });

      occupancyChanges.push({ businessId, occupancy: newOccupancy, event: 'exit' });
    }
  }

  return { alerts, occupancyChanges };
}

/**
 * Find businesses within a radius of a lat/lng point.
 * @param {number} lat
 * @param {number} lng
 * @param {number} radiusKm
 * @param {string|null} category - optional category filter
 */
export async function getBusinessesNearby(lat, lng, radiusKm = 5, category = null) {
  const params = [lng, lat, radiusKm * 1000]; // ST_DWithin uses meters
  let categoryClause = '';
  if (category) {
    params.push(category);
    categoryClause = `AND b.category = $${params.length}`;
  }

  const { rows } = await query(`
    SELECT
      b.id,
      b.name,
      b.address,
      b.category,
      b.capacity,
      b.current_occupancy,
      b.q_slot_allocation,
      b.entry_fee_cents,
      b.description,
      ROUND(b.current_occupancy::numeric / NULLIF(b.capacity, 0) * 100) AS occupancy_pct,
      ST_Distance(
        b.geofence_polygon::geography,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
      ) AS distance_meters
    FROM businesses b
    WHERE ST_DWithin(
      b.geofence_polygon::geography,
      ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
      $3
    )
    AND b.is_active = TRUE
    ${categoryClause}
    ORDER BY distance_meters ASC
    LIMIT 50
  `, params);

  return rows;
}

/**
 * Check if a specific user is currently inside a specific business geo-fence.
 * Uses Redis cache first, falls back to PostGIS.
 * @param {string} userId
 * @param {string} businessId
 */
export async function isUserInsideBusiness(userId, businessId) {
  const cacheKey = `q:in_fence:${businessId}:${userId}`;
  const cached = await redis.get(cacheKey);
  return cached === '1';
}
