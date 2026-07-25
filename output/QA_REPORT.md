# Q Platform — QA Report

*Cross-checked against: whitepaper.md, PLAN.md, BACKEND_SUMMARY.md, AUTH_SUMMARY.md, PAYMENTS_SUMMARY.md, FRONTEND_SUMMARY.md, ADMIN_SUMMARY.md*

---

## 1. Whitepaper Coverage Checklist

### Core Platform

| Feature | Status | File(s) |
|---------|--------|---------|
| Geo-fenced queuing system | ✅ IMPLEMENTED | `geoService.js`, `db/schema.sql` (PostGIS) |
| Real-time occupancy counter | ✅ IMPLEMENTED | `geoService.js` (Redis INCR + DB sync), `occupancy:update` socket |
| Q-user selfie + ID verification | ✅ IMPLEMENTED | `verificationService.js`, `auth/routes/auth.js` |
| Admin approval workflow | ✅ IMPLEMENTED | `users.js` (`/admin/users/pending`, `/approve`, `/reject`) |
| Default score = 100 | ✅ IMPLEMENTED | `scoringService.js`, `behavior_scores` table |
| Score docking on infraction | ✅ IMPLEMENTED | `DOCK` constants in `scoringService.js` |
| Clean-visit score recovery | ✅ IMPLEMENTED | `applyCleanVisit()` in `scoringService.js` |
| Recovery curve (slower at lower scores) | ✅ IMPLEMENTED | `recoveryAmount()` — tiered: 10/5/2/1 |
| Red flag at 3+ venue bans | ✅ IMPLEMENTED | `checkAndSetRedFlag()` in `scoringService.js` |
| Red flag visible to staff | ✅ IMPLEMENTED | `QueueRow.jsx` skull chip, `getQueueState()` joins red_flags |
| Ban geo-fence alert to staff | ✅ IMPLEMENTED | `geoService.js` → `ban:geofence_alert` socket → `AlertBanner.jsx` |
| Ban notification to user | ✅ IMPLEMENTED | `geoService.js` → `ban:entry_warning` socket |
| Admission timer (90s per whitepaper) | ✅ IMPLEMENTED | `timerService.js` default 90s, configurable per business |
| Miss timer → back of queue + score dock | ✅ IMPLEMENTED | BullMQ worker in `timerService.js` |
| Pre-booking with grace period (15–30 min) | ✅ IMPLEMENTED | `bookings.js`, `scheduleGraceTimer()` |
| Miss grace period → no-show + score dock | ✅ IMPLEMENTED | BullMQ `grace-timers` worker |
| Premium grace time purchase | ✅ IMPLEMENTED | `premiumService.js`, `POST /payments/premium` |
| Q slot allocation (10–50) | ✅ IMPLEMENTED | `businesses.q_slot_allocation`, enforced in `joinQueue()` |
| 1% platform fee on every transaction | ✅ IMPLEMENTED | `feeService.js` `calculateFee()` |
| Bi-weekly payout to businesses | ✅ IMPLEMENTED | `biweeklyPayout.js` cron + `payoutService.js` |
| Stripe Connect for venue payouts | ✅ IMPLEMENTED | `stripeService.js` `createConnectAccount()` |
| User reward credits from ad revenue | ✅ IMPLEMENTED | `ad_impressions`, `reward_credits`, `POST /rewards/ad-impression` |
| Reward credits redeemable on entry fees | ✅ IMPLEMENTED | `POST /payments/rewards/redeem`, discount logic in `POST /payments/intent` |
| Map home screen with venue markers | ✅ IMPLEMENTED | `Home.jsx` — Google Maps with occupancy pins |
| Queue join flow | ✅ IMPLEMENTED | `VenueDetail.jsx` → `useQueue.join()` → `Queue.jsx` |
| Live queue position (real-time socket) | ✅ IMPLEMENTED | `Queue.jsx` + `useQueue.js` socket listeners |
| Full-screen countdown timer UI | ✅ IMPLEMENTED | `QueueTimer.jsx` — swipe-to-confirm, urgent animations |
| Swipe to confirm entry | ✅ IMPLEMENTED | `QueueTimer.jsx` framer-motion drag gesture |
| Score badge: green/yellow/red/skull | ✅ IMPLEMENTED | `ScoreBadge.jsx` (frontend), `ScoreChip.jsx` (admin) |
| Venue admin dashboard (occupancy + queue) | ✅ IMPLEMENTED | `Dashboard.jsx` (admin) |
| Admit button (large, green) | ✅ IMPLEMENTED | `QueueRow.jsx` |
| Geo-fence alert banner (red flash, photo) | ✅ IMPLEMENTED | `AlertBanner.jsx` |
| Ban issuance from staff panel | ✅ IMPLEMENTED | `BanManager.jsx` → `POST /bans` |
| Ban lift from staff panel | ✅ IMPLEMENTED | `BanManager.jsx` → `DELETE /bans/:id` |
| Business settings (Q slots, grace, split %) | ✅ IMPLEMENTED | `Settings.jsx` → `PATCH /businesses/:id` |
| Payout history + Stripe onboarding | ✅ IMPLEMENTED | `Payouts.jsx` |
| Multi-vertical support (all business types) | ✅ IMPLEMENTED | `businesses.category` enum, category icons in frontend |
| Targeted ad serving by category/city | ✅ IMPLEMENTED | `ads.target_category`, `ads.target_city` columns |
| User visit history | ✅ IMPLEMENTED | `GET /users/:id/visits` |
| NFC boundary option | ⚠️ PARTIAL | Documented in schema as future option; geo-fence is the primary implementation. NFC requires native mobile SDK outside PWA scope. |
| Apple Maps support | ⚠️ PARTIAL | Google Maps implemented. Apple Maps would require MapKit JS integration — swap in `Home.jsx`. |
| User-to-business scoring (businesses rate users) | ✅ IMPLEMENTED | Staff can dock score via ban + remove actions (score events logged) |
| Business rates user on behavior | ⚠️ PARTIAL | No explicit "5-star rating" UI. Score docking covers conduct; a dedicated rating widget could be added to `QueueRow.jsx`. |
| Push notifications (not just in-app) | ⚠️ PARTIAL | In-app socket events + toasts implemented. Native push (FCM/APNs) not wired — requires service worker `push` handler + backend web-push library. |
| COVID/fire capacity enforcement | ✅ IMPLEMENTED | Occupancy counter + capacity field enforces limits; staff see warning at 95%+ |

---

## 2. Integration Gaps

### Frontend → Backend endpoint mismatches

| Issue | Detail | Severity |
|-------|--------|----------|
| `Home.jsx` fetches `/geo/businesses/nearby` | Backend registers this at `GET /api/geo/businesses/nearby` via inline route in `index.js` — correct. | ✅ OK |
| `BanManager.jsx` calls `GET /users?phone=...` | No `?phone` search endpoint exists. Backend `GET /users/:id` requires a UUID, not a phone query. | ❌ **GAP** |
| `Admin App.jsx` passes `user?.accessToken` to `useVenueSocket` | `useAdminAuth` returns a `user` object from `/auth/me` which does NOT include the accessToken. Token is stored separately via `setAdminToken()`. | ❌ **GAP** |
| `QueueTimer.jsx` imported in `Queue.jsx` via `useQueue(businessId, socket)` | `useQueue` hook signature accepts socket but timer state managed separately. Correctly wired. | ✅ OK |
| `payments/intent` — `entry_fee` type assumed | Webhook handler also handles `booking` type but booking creation route (`POST /bookings`) doesn't create a payment intent first. | ⚠️ PARTIAL |

### Socket events: emitted but not consumed

| Event | Emitted | Consumed | Gap |
|-------|---------|----------|-----|
| `queue:admitted` | ✅ Backend | ✅ `useQueue.js` | OK |
| `booking:checked_in` | ✅ Backend | ❌ Frontend | Frontend not listening — no handler needed unless UI needs to update, but harmless. |
| `ban:geofence_alert` | ✅ Backend | ✅ Admin `useVenueSocket.js` | OK |

### Missing webhook handling

| Scenario | Status |
|----------|--------|
| `payment_intent.succeeded` for standard booking | ✅ Handled — records transaction |
| `payment_intent.succeeded` for premium grace | ✅ Handled — calls `fulfillPremiumGrace()` |
| Queue admission after webhook | ⚠️ PARTIAL — webhook records transaction but does NOT automatically call `admitEntry()`. Staff still must manually admit. This is correct for the walk-in flow; for automated entry on payment, a queue status transition from `payment_pending` would be needed. |
| Stripe payout failure notifications | ❌ NOT HANDLED — `payoutService.js` logs errors but doesn't retry or alert platform admin |

### Env vars referenced but not in `.env.example`

| Var | Where referenced | Status |
|-----|-----------------|--------|
| `VITE_API_URL` | `frontend/src/api/client.js` | ⚠️ Not in backend `.env.example` — needs a `frontend/.env.example` |
| `VITE_GOOGLE_MAPS_API_KEY` | `Home.jsx` | ⚠️ Not documented anywhere — needs `frontend/.env.example` |
| All frontend env vars | Vite `import.meta.env.VITE_*` | ❌ No `frontend/.env.example` file was created |

---

## 3. Business Logic Verification

| Rule | Verified | Notes |
|------|----------|-------|
| Score default = 100 | ✅ | `registerUser()` inserts `behavior_scores` with default 100 |
| Infraction docking (no-show −20, timer −10, grace −15, removed −15, ban −30) | ✅ | `DOCK` object in `scoringService.js` |
| Recovery curve (80–100 → +10, 50–79 → +5, 20–49 → +2, 1–19 → +1) | ✅ | `recoveryAmount()` function |
| Clean visit triggers recovery | ✅ | `confirmEntry()` calls `applyCleanVisit()` |
| Red flag at 3+ active bans | ✅ | `checkAndSetRedFlag()` counts distinct `business_id` |
| Red flag cleared when bans lifted | ✅ | `liftBan()` calls `checkAndSetRedFlag()` + `clearRedFlag()` |
| Admission timer = 90s (configurable) | ✅ | `businesses.admission_timer_seconds` default 90, per whitepaper |
| Miss timer → back of queue | ✅ | BullMQ worker re-inserts at `max_pos + 1` |
| Miss timer → score −10 | ✅ | Worker calls `applyInfraction('MISS_ADMISSION_TIMER')` |
| Grace period 15–30 min (venue-configured) | ✅ | CHECK constraint on `businesses.grace_period_minutes` |
| Miss grace → no-show + score dock | ✅ | `grace-timers` worker calls `applyInfraction('MISS_GRACE_PERIOD')` |
| Ban geo-fence alert to staff AND user | ✅ | `geoService.js` emits to both `business:` and `user:` rooms |
| Q slot allocation 10–50 (enforced) | ✅ | `joinQueue()` checks `admitted_count >= q_slot_allocation` |
| 1% fee on every transaction | ✅ | `calculateFee()`: `Math.round(amount * 0.01)` |
| Bi-weekly payout | ✅ | `biweeklyPayout.js` with `node-cron` |
| Premium grace: business gets 10–50% | ✅ | `premiumService.js` splits by `premium_revenue_split` |
| Reward credits from ads | ✅ | `POST /rewards/ad-impression` credits 20% of CPM |
| Reward credits offset cover charge | ✅ | `POST /payments/intent` deducts `rewardCentsToApply` |
| Age gate (18+) at registration | ✅ | `isOfLegalAge()` in `validators.js` |

---

## 4. Security Flags

| Issue | Severity | File | Fix |
|-------|----------|------|-----|
| **S3 keys never returned** — `selfie_key`/`id_doc_key` stripped in `/auth/me` | ✅ Fixed | `auth/routes/auth.js` | Destructured out before response |
| **JWT stored in memory only** — not localStorage | ✅ Fixed | `frontend/src/store/index.js` | Access token in Zustand (memory) |
| **Refresh token httpOnly cookie** | ✅ Fixed | `sessionService.js` | `httpOnly: true, secure: true` in prod |
| **Rate limiting on login** (5/15min) | ✅ Fixed | `auth/routes/auth.js` | Per-route config on login and venue/login |
| **Timing-safe login** | ✅ Fixed | `authService.js` | bcrypt runs even when user not found |
| **Stripe webhook signature verification** | ✅ Fixed | `payments/routes/payments.js` | `constructWebhookEvent()` |
| **Business admin required for settings** | ✅ Fixed | `middleware/venueAuth.js` | `requireBusinessAdmin` |
| **`DELETE /bans/:id` uses `requireBusinessAdmin`** | ⚠️ GAP | `rewards.js` | Route uses `requireBusinessAdmin` but doesn't extract `businessId` from the ban record — middleware falls back to `request.params.businessId` which doesn't exist on this path. Staff could lift bans at other businesses. |
| **No CSRF protection** | ⚠️ MEDIUM | All POST routes | SameSite=strict on cookie helps; add `@fastify/csrf-protection` for full protection |
| **Payment intent: no user-business ownership check** | ⚠️ MEDIUM | `payments/routes/payments.js` | Any verified user can create intent for any business — this is correct behavior (paying cover to enter), so not a bug but worth documenting. |
| **Admin image review uses pre-signed URLs** | ✅ OK | `verificationService.js` | 15-min expiry, never returned to end users |
| **Webhook raw body** | ⚠️ PARTIAL | `payments.js` | `config: { rawBody: true }` set but Fastify needs `addContentTypeParser` for raw body. Needs explicit plugin registration. |
| **`BanManager.jsx` phone search** | ⚠️ LOW | Admin screen | Searching users by phone number without auth-checked admin route could expose PII. Backend search endpoint must restrict to staff. |

---

## 5. Priority Fix List

| # | Priority | Issue | Fix |
|---|----------|-------|-----|
| 1 | **CRITICAL** | `DELETE /bans/:id` middleware doesn't verify the ban belongs to the requesting staff member's business | Fetch the ban's `business_id` first, then pass it to `requireBusinessAdmin` |
| 2 | **CRITICAL** | Stripe webhook raw body not parsed — `request.rawBody` will be undefined | Add `fastify.addContentTypeParser('application/json', { parseAs: 'buffer' }, ...)` for `/api/payments/webhook` route |
| 3 | **CRITICAL** | `Admin App.jsx` passes `user?.accessToken` to `useVenueSocket` but token is not on user object | Pass the stored admin token from `sessionStorage` or expose it from `useAdminAuth` |
| 4 | **HIGH** | `BanManager.jsx` calls `GET /users?phone=...` — endpoint doesn't exist | Add `GET /api/users/search?phone=...` route (staff-only, returns safe profile only) |
| 5 | **HIGH** | No `frontend/.env.example` — `VITE_API_URL` and `VITE_GOOGLE_MAPS_API_KEY` undocumented | Create `output/frontend/.env.example` with all Vite env vars |
| 6 | **HIGH** | Payout failures are logged but not alerted — platform admin has no visibility | Add payout failure webhook/alert: email to platform admin or Slack notification from `payoutService.js` |
| 7 | **HIGH** | Booking flow doesn't create Stripe Payment Intent before confirming booking — `payment_intent_id` is nullable in schema but no payment enforcement | Either gate booking creation on a pre-confirmed payment intent, or make booking "pending" until webhook fires |
| 8 | **MEDIUM** | No `frontend/public/index.html` or root `index.html` — Vite needs this entry point | Create `output/frontend/index.html` with `<div id="root">` and script import |
| 9 | **MEDIUM** | `useVenueSocket` captures `socket` in `useRef` but returns `socketRef.current` which is null on first render | Return socket via state instead of ref, or memoize |
| 10 | **LOW** | No `admin/public/index.html` | Create `output/admin/index.html` entry point |

---

## 6. Ready to Ship (Staging-Ready)

| Module | Readiness | Notes |
|--------|-----------|-------|
| **Database Schema** | ✅ Ready | `schema.sql` is complete and runnable. Run with PostGIS extension. |
| **Scoring Service** | ✅ Ready | All rules implemented, audited via `score_events` |
| **Geo Service** | ✅ Ready | PostGIS + Redis geo detection working |
| **Timer Service** | ✅ Ready | BullMQ persistence, 90s admission + grace timers |
| **Ban Service** | ✅ Ready (after fix #1) | Red flag logic solid; lift ban auth fix needed |
| **Queue Service** | ✅ Ready | State machine complete |
| **Auth Routes** | ✅ Ready | Registration flow, OTP, ID upload, JWT rotation all wired |
| **Backend API** | ✅ Ready (after fix #2) | Webhook raw body parsing is the only blocker |
| **Payments** | ⚠️ Needs fix #7 | Core Stripe wiring solid; booking payment enforcement gap |
| **Frontend PWA** | ⚠️ Needs fix #8 | Missing `index.html` entry; all screens complete |
| **Admin Panel** | ⚠️ Needs fixes #3, #4 | Auth token and user search gaps; all screens built |

---

*QA completed against all 6 summary files + whitepaper content. Total files produced: 47.*
