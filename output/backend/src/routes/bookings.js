/**
 * Booking Routes
 * POST  /api/bookings
 * GET   /api/bookings/mine
 * GET   /api/bookings/:id
 * POST  /api/bookings/:id/check-in
 * POST  /api/bookings/:id/cancel
 * POST  /api/bookings/:id/no-show
 * GET   /api/bookings/business/:businessId
 */

import { query, withTransaction } from '../db/client.js';
import { requireAuth, requireVerified } from '../middleware/auth.js';
import { requireBusinessStaff } from '../middleware/venueAuth.js';
import { scheduleGraceTimer, cancelGraceTimer } from '../services/timerService.js';
import { applyInfraction } from '../services/scoringService.js';

export default async function bookingRoutes(fastify) {
  const { io } = fastify;

  // Create a pre-booking (payment handled separately via /api/payments/intent)
  fastify.post('/', {
    preHandler: [requireVerified],
  }, async (request, reply) => {
    const {
      businessId,
      booking_date,
      booking_time,
      party_size = 1,
      payment_intent_id,
      notes,
    } = request.body;
    const userId = request.user.user_id;

    const result = await withTransaction(async (client) => {
      // Get business config for grace period
      const { rows: biz } = await client.query(
        'SELECT grace_period_minutes, entry_fee_cents FROM businesses WHERE id = $1',
        [businessId]
      );
      if (!biz[0]) throw new Error('Business not found');

      // Calculate grace deadline: booking_date + booking_time + grace_period_minutes
      const graceDeadline = new Date(
        `${booking_date}T${booking_time}`
      );
      graceDeadline.setMinutes(graceDeadline.getMinutes() + biz[0].grace_period_minutes);

      const { rows } = await client.query(`
        INSERT INTO bookings (
          business_id, user_id, booking_date, booking_time,
          party_size, status, payment_intent_id,
          amount_cents, grace_deadline_at, notes
        )
        VALUES ($1,$2,$3,$4,$5,'confirmed',$6,$7,$8,$9)
        RETURNING id, grace_deadline_at
      `, [
        businessId, userId, booking_date, booking_time,
        party_size, payment_intent_id,
        biz[0].entry_fee_cents * party_size, graceDeadline.toISOString(), notes,
      ]);

      return rows[0];
    });

    // Schedule grace expiry job
    await scheduleGraceTimer(result.id, new Date(result.grace_deadline_at));

    return reply.code(201).send(result);
  });

  // My bookings
  fastify.get('/mine', {
    preHandler: [requireAuth],
  }, async (request) => {
    const { rows } = await query(`
      SELECT bk.*, b.name AS business_name, b.category, b.address
      FROM bookings bk JOIN businesses b ON b.id = bk.business_id
      WHERE bk.user_id = $1
      ORDER BY bk.booking_date DESC, bk.booking_time DESC
      LIMIT 50
    `, [request.user.user_id]);
    return { bookings: rows };
  });

  // Booking detail
  fastify.get('/:id', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { rows } = await query(`
      SELECT bk.*, b.name AS business_name, b.category, b.grace_period_minutes
      FROM bookings bk JOIN businesses b ON b.id = bk.business_id
      WHERE bk.id = $1
    `, [request.params.id]);
    if (!rows[0]) return reply.code(404).send({ error: 'Booking not found' });

    // Only owner or staff can view
    const booking = rows[0];
    const isOwner = booking.user_id === request.user.user_id;
    if (!isOwner && request.user.role === 'user') {
      return reply.code(403).send({ error: 'Forbidden' });
    }
    return booking;
  });

  // Staff: check in booking
  fastify.post('/:id/check-in', {
    preHandler: [requireBusinessStaff],
  }, async (request, reply) => {
    const { rows } = await query(`
      UPDATE bookings SET status = 'checked_in'
      WHERE id = $1 AND status = 'confirmed'
      RETURNING user_id, business_id
    `, [request.params.id]);
    if (!rows[0]) return reply.code(400).send({ error: 'Booking not in confirmed state' });

    // Cancel grace timer — they arrived
    await cancelGraceTimer(request.params.id);

    if (io) {
      io.to(`user:${rows[0].user_id}`).emit('booking:checked_in', {
        bookingId: request.params.id,
      });
    }
    return { success: true };
  });

  // User cancels booking
  fastify.post('/:id/cancel', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { rows } = await query(
      'SELECT user_id, status FROM bookings WHERE id = $1',
      [request.params.id]
    );
    if (!rows[0]) return reply.code(404).send({ error: 'Not found' });
    if (rows[0].user_id !== request.user.user_id) {
      return reply.code(403).send({ error: 'Forbidden' });
    }
    if (!['pending','confirmed'].includes(rows[0].status)) {
      return reply.code(400).send({ error: 'Cannot cancel this booking' });
    }

    await query(`UPDATE bookings SET status = 'cancelled' WHERE id = $1`, [request.params.id]);
    await cancelGraceTimer(request.params.id);
    return { success: true };
  });

  // Staff: manually mark no-show
  fastify.post('/:id/no-show', {
    preHandler: [requireBusinessStaff],
  }, async (request, reply) => {
    const { rows } = await query(`
      UPDATE bookings SET status = 'no_show'
      WHERE id = $1 AND status = 'confirmed'
      RETURNING user_id, business_id
    `, [request.params.id]);
    if (!rows[0]) return reply.code(400).send({ error: 'Booking not in confirmed state' });

    await applyInfraction(rows[0].user_id, 'NO_SHOW_BOOKING', rows[0].business_id);

    if (io) {
      io.to(`user:${rows[0].user_id}`).emit('booking:no_show', {
        bookingId: request.params.id,
        message: 'You were marked as a no-show for your booking.',
        scoreDock: -20,
      });
    }
    return { success: true };
  });

  // Business bookings list (for staff dashboard)
  fastify.get('/business/:businessId', {
    preHandler: [requireBusinessStaff],
  }, async (request) => {
    const { date } = request.query;
    const params = [request.params.businessId];
    let dateClause = '';
    if (date) {
      params.push(date);
      dateClause = `AND bk.booking_date = $${params.length}`;
    }

    const { rows } = await query(`
      SELECT bk.*, u.full_name, u.profile_photo_url, COALESCE(bs.score, 100) AS score,
             COALESCE(rf.is_active, FALSE) AS is_red_flagged
      FROM bookings bk
      JOIN users u ON u.id = bk.user_id
      LEFT JOIN behavior_scores bs ON bs.user_id = bk.user_id
      LEFT JOIN red_flags rf ON rf.user_id = bk.user_id AND rf.is_active = TRUE
      WHERE bk.business_id = $1 ${dateClause}
      ORDER BY bk.booking_date ASC, bk.booking_time ASC
    `, params);
    return { bookings: rows };
  });
}
