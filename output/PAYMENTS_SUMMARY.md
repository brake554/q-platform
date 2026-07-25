# Payments Summary

## What Was Built

Complete Stripe-based payment layer including Connect onboarding, fee calculation, bi-weekly payouts, premium grace purchases, and reward redemption.

### Files Written
```
output/payments/src/
├── routes/payments.js          — All payment endpoints
├── services/stripeService.js   — Stripe API wrapper (customers, intents, transfers, connect)
├── services/feeService.js      — 1% fee calculation, transaction recording, payout totals
├── services/payoutService.js   — Bi-weekly payout batch runner
├── services/premiumService.js  — Premium grace time purchase and fulfillment
├── services/rewardService.js   — Reward credit ledger (credit/debit)
└── jobs/biweeklyPayout.js      — node-cron job (every other Monday 3am UTC)
```

---

## Payment Flow

### Entry Fee / Booking Payment
```
1. Frontend: POST /api/payments/intent → receives { clientSecret, paymentIntentId }
2. Frontend: Stripe.js confirmPayment(clientSecret) → Stripe handles card
3. Stripe: Sends payment_intent.succeeded webhook to POST /api/payments/webhook
4. Backend webhook: recordTransaction() → inserts into transactions table with:
   - platform_fee_cents = ROUND(amount_cents * 0.01)
   - business_net_cents = amount_cents - platform_fee_cents
5. Queue admission is granted after webhook confirmation
```

### Premium Grace Time
```
1. Frontend: POST /api/payments/premium { businessId, bookingId, minutesPurchased }
2. Backend: Creates payment intent with metadata { type: 'premium_grace', booking_id, minutes }
3. Frontend: Stripe.js confirmPayment(clientSecret)
4. Stripe: payment_intent.succeeded webhook → fulfillPremiumGrace()
   - Extends bookings.grace_deadline_at
   - Records in premium_purchases table
   - Cancels old BullMQ grace timer, schedules new one
   - Splits revenue: business gets premium_revenue_split% (10–50%)
```

### Reward Credit Flow
```
Ad served to user → POST /api/rewards/ad-impression
  → Calculates reward_cents = CPM / 1000 * 20% (user's share)
  → Credits reward_credits.balance_cents
  → Logs in reward_transactions

User pays entry fee → POST /api/payments/intent { rewardCentsToApply }
  → redeemRewards() debits balance
  → Stripe charged for remaining amount (or free if fully covered)
```

### Bi-Weekly Payout
```
Cron: every other Monday 03:00 UTC (configurable via PAYOUT_CRON_SCHEDULE)
  → getPendingPayoutTotals(): SUM(business_net_cents) WHERE paid_out = FALSE
  → Per business: stripe.transfers.create(amount, destination: stripe_account_id)
  → markPaidOut(businessId, batchId): UPDATE transactions SET paid_out = TRUE
  → Batch ID format: payout_YYYY-MM-DD_xxxxxxxx
```

---

## Stripe Webhook Events Handled

| Event | Action |
|-------|--------|
| `payment_intent.succeeded` | Record transaction; if `type=premium_grace`, extend booking deadline |
| `payment_intent.payment_failed` | Log warning; no DB change (queue not admitted) |
| `account.updated` | Log Connect account status changes |

---

## Environment Variables Required

```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_CONNECT_CLIENT_ID
PLATFORM_FEE_PERCENT         (default: 1)
PAYOUT_CRON_SCHEDULE         (default: "0 3 * * 1/2")
ADMIN_URL                    (for Connect return URL)
```

---

## Key Design Decisions

- **Stripe application_fee_amount:** Platform 1% fee is implemented as Stripe's application_fee_amount on the Payment Intent — Stripe automatically splits it at capture time. No manual calculation needed at payout.
- **Webhook gates admission:** Queue entry is only granted after `payment_intent.succeeded` fires — prevents charging without admission or admitting without payment.
- **Reward credit max redemption:** Capped at the entry fee amount — users can't earn negative charges.
- **Premium revenue split:** 10–50% to business (configurable per business). The whitepaper specifies this range; default is 20%.
- **Bi-weekly payout:** Stripe Transfers (not Stripe Payouts) — the platform account holds funds and transfers to Express accounts. Businesses must complete Stripe onboarding first.
