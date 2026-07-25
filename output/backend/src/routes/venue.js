/**
 * Business (Venue) Routes
 * GET    /api/businesses
 * GET    /api/businesses/:businessId
 * GET    /api/businesses/:businessId/occupancy
 * POST   /api/businesses            (platform_admin)
 * PATCH  /api/businesses/:businessId (business_admin)
 * GET    /api/businesses/:businessId/staff
 * POST   /api/businesses/:businessId/staff
 * DELETE /api/businesses/:businessId/staff/:userId
 * GET    /api/geo/businesses/nearby
 * POST   /api/geo/checkin
 */

import { query } from '../db/client.js';
import { requireAuth, requirePlatformAdmin } from '../middleware/auth.js';
import { requireBusinessStaff, requireBusinessAdmin } from '../middleware/venueAuth.js';
import { getBusinessesNearby, updateUserPosition } from '../services/geoService.js';

export default async function businessRoutes(fastify) {
  const { io } = fastify;

  // ── Public/authenticated endpoints ────────────────────────────────────────

  // List businesses (with optional city/category filter)
  fastify.get('/', {
    preHandler: [requireAuth],
  }, async (request) => {
    const { city, category, lat, lng, radius = 10 } = request.query;

    if (lat && lng) {
      const results = await getBusinessesNearby(
        parseFloat(lat),
        parseFloat(lng),
        parseFloat(radius),
        category || null
      );
      return { businesses: results };
    }

    const params = [];
    let where = 'WHERE b.is_active = TRUE';
    if (city) { params.push(city); where += ` AND b.city = $${params.length}`; }
    if (category) { params.push(category); where += ` AND b.category = $${params.length}`; }

    const { rows } = await query(`
      SELECT id, name, address, city, category, capacity, current_occupancy,
             q_slot_allocation, entry_fee_cents, description,
             ROUND(current_occupancy::numeric / NULLIF(capacity, 0) * 100) AS occupancy_pct
      FROM businesses b ${where}
      ORDER BY name ASC
    `, params);
    return { businesses: rows };
  });

  // Business detail
  fastify.get('/:businessId', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { rows } = await query(`
      SELECT b.id, b.name, b.address, b.city, b.category, b.capacity,
             b.current_occupancy, b.q_slot_allocation, b.grace_period_minutes,
             b.admission_timer_seconds, b.entry_fee_cents, b.description,
             ROUND(b.current_occupancy::numeric / NULLIF(b.capacity, 0) * 100) AS occupancy_pct,
             (SELECT COUNT(*) FROM queues q
              JOIN queue_entries qe ON qe.queue_id = q.id
              WHERE q.business_id = b.id AND q.is_active = TRUE
                AND qe.status IN ('waiting','timer_active')) AS queue_length
      FROM businesses b
      WHERE b.id = $1 AND b.is_active = TRUE
    `, [request.params.businessId]);
    if (!rows[0]) return reply.code(404).send({ error: 'Business not found' });
    return rows[0];
  });

  // Live occupancy
  fastify.get('/:businessId/occupancy', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { rows } = await query(
      'SELECT current_occupancy, capacity FROM businesses WHERE id = $1',
      [request.params.businessId]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Not found' });
    return rows[0];
  });

  // ── Geo endpoints ──────────────────────────────────────────────────────────

  // Nearby businesses
  fastify.get('/nearby', {
    preHandler: [requireAuth],
    // route registered as /api/geo/businesses/nearby in index.js
  }, async (request) => {
    const { lat, lng, radius = 5, category } = request.query;
    const results = await getBusinessesNearby(
      parseFloat(lat), parseFloat(lng), parseFloat(radius), category || null
    );
    return { businesses: results };
  });

  // User GPS check-in — triggers geo-fence detection + ban alerts + occupancy
  fastify.post('/checkin', {
    preHandler: [requireAuth],
  }, async (request) => {
    const { lat, lng } = request.body;
    const userId = request.user.user_id;
    const result = await updateUserPosition(userId, parseFloat(lat), parseFloat(lng), io);
    return result;
  });

  // ── Admin endpoints ────────────────────────────────────────────────────────

  // Create business (platform admin only)
  fastify.post('/', {
    preHandler: [requirePlatformAdmin],
  }, async (request, reply) => {
    const {
      name, address, city, category = 'nightlife', capacity,
      q_slot_allocation = 20, grace_period_minutes = 15,
      admission_timer_seconds = 90, entry_fee_cents = 0,
      geofence_polygon_geojson, // GeoJSON Polygon
    } = request.body;

    const { rows } = await query(`
      INSERT INTO businesses (
        name, address, city, category, capacity, q_slot_allocation,
        grace_period_minutes, admission_timer_seconds, entry_fee_cents,
        geofence_polygon
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,
        ST_SetSRID(ST_GeomFromGeoJSON($10), 4326)
      )
      RETURNING id
    `, [name, address, city, category, capacity, q_slot_allocation,
        grace_period_minutes, admission_timer_seconds, entry_fee_cents,
        JSON.stringify(geofence_polygon_geojson)]);

    return reply.code(201).send({ id: rows[0].id });
  });

  // Update business settings (business admin)
  fastify.patch('/:businessId', {
    preHandler: [requireBusinessAdmin],
  }, async (request) => {
    const {
      q_slot_allocation, grace_period_minutes, admission_timer_seconds,
      entry_fee_cents, premium_revenue_split, price_per_grace_minute_cents,
      description,
    } = request.body;

    await query(`
      UPDATE businesses
      SET q_slot_allocation            = COALESCE($2, q_slot_allocation),
          grace_period_minutes         = COALESCE($3, grace_period_minutes),
          admission_timer_seconds      = COALESCE($4, admission_timer_seconds),
          entry_fee_cents              = COALESCE($5, entry_fee_cents),
          premium_revenue_split        = COALESCE($6, premium_revenue_split),
          price_per_grace_minute_cents = COALESCE($7, price_per_grace_minute_cents),
          description                  = COALESCE($8, description)
      WHERE id = $1
    `, [request.params.businessId, q_slot_allocation, grace_period_minutes,
        admission_timer_seconds, entry_fee_cents, premium_revenue_split,
        price_per_grace_minute_cents, description]);

    return { success: true };
  });

  // Staff management
  fastify.get('/:businessId/staff', {
    preHandler: [requireBusinessAdmin],
  }, async (request) => {
    const { rows } = await query(`
      SELECT bs.role, u.id, u.full_name, u.email, bs.created_at
      FROM business_staff bs JOIN users u ON u.id = bs.user_id
      WHERE bs.business_id = $1
      ORDER BY u.full_name
    `, [request.params.businessId]);
    return { staff: rows };
  });

  fastify.post('/:businessId/staff', {
    preHandler: [requireBusinessAdmin],
  }, async (request, reply) => {
    const { userId, role = 'staff' } = request.body;
    await query(`
      INSERT INTO business_staff (business_id, user_id, role)
      VALUES ($1, $2, $3)
      ON CONFLICT (business_id, user_id) DO UPDATE SET role = $3
    `, [request.params.businessId, userId, role]);
    return reply.code(201).send({ success: true });
  });

  fastify.delete('/:businessId/staff/:userId', {
    preHandler: [requireBusinessAdmin],
  }, async (request) => {
    await query(`
      DELETE FROM business_staff WHERE business_id = $1 AND user_id = $2
    `, [request.params.businessId, request.params.userId]);
    return { success: true };
  });
}
