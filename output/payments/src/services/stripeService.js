/**
 * Stripe Service
 *
 * Wraps Stripe API calls for:
 * - Customer creation/retrieval (Q-users)
 * - Payment Intent creation (entry fees, bookings)
 * - Connect account onboarding (businesses)
 * - Transfers to Connected Accounts (payouts)
 */

import Stripe from 'stripe';
import { query } from '../../../backend/src/db/client.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-04-10',
});

export { stripe };

// ─── Customers ───────────────────────────────────────────────────────────────

/**
 * Get or create a Stripe Customer for a Q-user.
 * Stores the customer ID in users.stripe_customer_id.
 * @param {string} userId
 * @param {string} email
 * @returns {string} Stripe customer ID
 */
export async function getOrCreateCustomer(userId, email) {
  const { rows } = await query(
    'SELECT stripe_customer_id FROM users WHERE id = $1',
    [userId]
  );

  if (rows[0]?.stripe_customer_id) return rows[0].stripe_customer_id;

  const customer = await stripe.customers.create({
    email,
    metadata: { q_user_id: userId },
  });

  await query(
    'UPDATE users SET stripe_customer_id = $2 WHERE id = $1',
    [userId, customer.id]
  );

  return customer.id;
}

// ─── Payment Intents ──────────────────────────────────────────────────────────

/**
 * Create a Payment Intent for an entry fee or booking.
 * The actual charge is confirmed on the client side.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.email
 * @param {string} params.businessId
 * @param {number} params.amountCents
 * @param {string} params.currency       — default 'usd'
 * @param {string} params.description
 * @param {object} params.metadata
 * @returns {{ clientSecret: string, paymentIntentId: string }}
 */
export async function createPaymentIntent({
  userId,
  email,
  businessId,
  amountCents,
  currency = 'usd',
  description,
  metadata = {},
}) {
  const customerId = await getOrCreateCustomer(userId, email);

  // Get business Stripe account for automatic transfer
  const { rows } = await query(
    'SELECT stripe_account_id FROM businesses WHERE id = $1',
    [businessId]
  );
  const stripeAccountId = rows[0]?.stripe_account_id;

  const intentParams = {
    amount: amountCents,
    currency,
    customer: customerId,
    description,
    metadata: { q_user_id: userId, q_business_id: businessId, ...metadata },
    automatic_payment_methods: { enabled: true },
  };

  // If business has a Connected Account, use application_fee_amount (platform 1%)
  if (stripeAccountId) {
    intentParams.application_fee_amount = Math.round(amountCents * 0.01);
    intentParams.transfer_data = { destination: stripeAccountId };
  }

  const intent = await stripe.paymentIntents.create(intentParams);

  return { clientSecret: intent.client_secret, paymentIntentId: intent.id };
}

// ─── Connect Accounts (Business Onboarding) ───────────────────────────────────

/**
 * Create a Stripe Express Connected Account for a business.
 * Returns an onboarding link URL.
 * @param {string} businessId
 * @param {string} businessName
 * @param {string} returnUrl - URL to redirect after onboarding
 * @param {string} refreshUrl - URL if onboarding link expires
 * @returns {{ accountId: string, onboardingUrl: string }}
 */
export async function createConnectAccount(businessId, businessName, returnUrl, refreshUrl) {
  const account = await stripe.accounts.create({
    type: 'express',
    business_type: 'company',
    company: { name: businessName },
    metadata: { q_business_id: businessId },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });

  await query(
    'UPDATE businesses SET stripe_account_id = $2 WHERE id = $1',
    [businessId, account.id]
  );

  const link = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  });

  return { accountId: account.id, onboardingUrl: link.url };
}

/**
 * Check if a Connected Account has completed onboarding.
 * @param {string} stripeAccountId
 * @returns {{ complete: boolean, details: object }}
 */
export async function getAccountStatus(stripeAccountId) {
  const account = await stripe.accounts.retrieve(stripeAccountId);
  return {
    complete: account.details_submitted && !account.requirements?.currently_due?.length,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
  };
}

// ─── Payouts (Transfers) ─────────────────────────────────────────────────────

/**
 * Transfer collected funds to a business's Connected Account.
 * Used by the bi-weekly payout cron job.
 *
 * @param {string} stripeAccountId - Business's Stripe Express account ID
 * @param {number} amountCents - Net amount (after platform fee)
 * @param {string} description
 * @returns {{ transferId: string }}
 */
export async function transferToBusiness(stripeAccountId, amountCents, description) {
  const transfer = await stripe.transfers.create({
    amount: amountCents,
    currency: 'usd',
    destination: stripeAccountId,
    description,
  });
  return { transferId: transfer.id };
}

// ─── Webhook verification ─────────────────────────────────────────────────────

/**
 * Verify and parse a Stripe webhook event.
 * @param {Buffer} rawBody
 * @param {string} signature - Stripe-Signature header value
 * @returns {Stripe.Event}
 */
export function constructWebhookEvent(rawBody, signature) {
  return stripe.webhooks.constructEvent(
    rawBody,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  );
}
