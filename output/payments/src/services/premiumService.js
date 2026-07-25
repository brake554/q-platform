/**
 * Premium Service
 *
 * Q-users can purchase extra grace time (minutes) on top of the venue's default grace period.
 * Revenue split: business gets premium_revenue_split% (10–50%), platform gets the rest + 1% fee.
 */

import { query } from '../../../backend/src/db/client.js';
import { createPaymentIntent } from './stripeService.js';
import { recordTransaction } from './feeService.js';

/**
 * Create a payment intent for premium grace time purchase.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.email
 * @param {string} params.businessId
 * @param {string} params.bookingId
 * @param {number} params.minutesPurchased
 * @returns {{ clientSecret, paymentIntentId, totalCents, businessShareCents }}
 */
export async function createPremiumGraceIntent({
  userId,
  email,
  businessId,
  bookingId,
  minutesPurchased,
}) {
  if (minutesPurchased < 1 || minutesPurchased > 30) {
    throw Object.assign(
      new Error('Grace time purchase must be between 1 and 30 minutes'),
      { statusCode: 400 }
    );
  }

  const { rows: biz } = await query(`
    SELECT price_per_grace_minute_cents, premium_revenue_split, stripe_account_id
    FROM businesses WHERE id = $1
  `, [businessId]);
  if (!biz[0]) throw new Error('Business not found');

  const totalCents = biz[0].price_per_grace_minute_cents * minutesPurchased;
  const businessShareCents = Math.floor(totalCents * (biz[0].premium_revenue_split / 100));

  const { clientSecret, paymentIntentId } = await createPaymentIntent({
    userId,
    email,
    businessId,
    amountCents: totalCents,
    description: `Q Premium: ${minutesPurchased} extra grace minutes`,
    metadata: { type: 'premium_grace', booking_id: bookingId, minutes: minutesPurchased },
  });

  return { clientSecret, paymentIntentId, totalCents, businessShareCents };
}

/**
 * Fulfill a premium grace purchase after payment_intent.succeeded webhook.
 * Extends the booking's grace_deadline_at and records the purchase.
 *
 * @param {string} paymentIntentId
 * @param {object} metadata - From Stripe payment intent metadata
 */
export async function fulfillPremiumGrace(paymentIntentId, metadata) {
  const { booking_id: bookingId, minutes } = metadata;
  const minutesPurchased = parseInt(minutes, 10);

  const { rows: booking } = await query(`
    SELECT b.id, b.user_id, b.business_id, b.grace_deadline_at,
           bus.price_per_grace_minute_cents, bus.premium_revenue_split
    FROM bookings b JOIN businesses bus ON bus.id = b.business_id
    WHERE b.id = $1
  `, [bookingId]);
  if (!booking[0]) throw new Error(`Booking ${bookingId} not found`);

  const b = booking[0];
  const totalCents = b.price_per_grace_minute_cents * minutesPurchased;
  const businessShareCents = Math.floor(totalCents * (b.premium_revenue_split / 100));
  const platformShareCents = totalCents - businessShareCents;

  // Extend grace deadline
  const newDeadline = new Date(b.grace_deadline_at);
  newDeadline.setMinutes(newDeadline.getMinutes() + minutesPurchased);

  await query(`
    UPDATE bookings
    SET grace_deadline_at   = $2,
        extra_grace_minutes = extra_grace_minutes + $3
    WHERE id = $1
  `, [bookingId, newDeadline.toISOString(), minutesPurchased]);

  // Record premium purchase
  await query(`
    INSERT INTO premium_purchases (
      user_id, business_id, booking_id, minutes_purchased,
      price_per_minute_cents, total_cents, business_share_cents,
      platform_share_cents, payment_intent_id
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
  `, [
    b.user_id, b.business_id, bookingId, minutesPurchased,
    b.price_per_grace_minute_cents, totalCents, businessShareCents,
    platformShareCents, paymentIntentId,
  ]);

  // Record as transaction
  await recordTransaction({
    userId: b.user_id,
    businessId: b.business_id,
    type: 'premium_grace',
    amountCents: totalCents,
    stripePaymentIntentId: paymentIntentId,
  });

  // Update grace timer in BullMQ
  const { scheduleGraceTimer, cancelGraceTimer } = await import('../../../backend/src/services/timerService.js');
  await cancelGraceTimer(bookingId);
  await scheduleGraceTimer(bookingId, newDeadline);

  return { newGraceDeadline: newDeadline.toISOString(), minutesPurchased };
}
