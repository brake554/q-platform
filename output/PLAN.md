# Q App — Architecture Plan

> **Scope:** Q is a universal queuing and admission platform, not limited to nightlife. Supported business verticals include: bars/clubs, barbershops, salons, restaurants, tattoo shops, doctors offices, clinics, pharmacies, and any appointment-driven or capacity-constrained business.
>
> **Timer:** The whitepaper specifies "1 Minute, 30 second timer" (90 seconds). This is the default; businesses can configure their own timer window.
>
> **Source of truth:** `whitepaper.md` — provided by the founder directly in the project chat.

---

## 1. Tech Stack

### Frontend — React PWA (Vite)
- **React 18 + Vite** — Fast build, HMR, optimal PWA bundling
- **Zustand** — Lightweight global state (auth, queue, geo)
- **React Router v6** — Client-side routing with native-feeling transitions
- **Socket.io-client** — Real-time queue position + geo-fence alerts
- **@vis.gl/react-google-maps** — Map home screen with venue markers
- **Workbox (via vite-plugin-pwa)** — Service worker, offline shell, installable
- **Framer Motion** — Slide transitions between screens
- *Justification:* PWA eliminates app store friction for nightlife (users don't install apps at 11pm). Dark-theme, large touch targets are trivial in React. Vite builds are fast enough for rapid iteration.

### Backend API — Node.js + Fastify
- **Fastify** — 2× throughput vs Express, built-in schema validation (Ajv), plugin architecture
- **Socket.io** — Bi-directional real-time events; rooms per venue for targeted broadcasts
- **BullMQ** (Redis-backed) — Job queues for: countdown timers, bi-weekly payouts, OTP expiry
- **node-cron** — Scheduled bi-weekly payout trigger
- *Justification:* Fastify's schema-first approach reduces runtime bugs. BullMQ ensures timer jobs survive server restarts.

### Database — PostgreSQL 15 + PostGIS
- **PostgreSQL** — Relational integrity for users, venues, bookings, transactions
- **PostGIS** — Native geo-fence polygon storage + `ST_Contains()` for entry/exit detection
- **pgcrypto** — UUID generation
- *Justification:* PostGIS eliminates a separate geo service; `ST_Contains(geofence_polygon, user_point)` is a single indexed query.

### Cache / Queue State — Redis 7
- **Queue position state** — Redis sorted sets per venue (`venue:{id}:queue`)
- **Session store** — Refresh token tracking
- **BullMQ backing store** — Timer jobs and payout jobs
- **Pub/Sub** — Cross-process socket event fanout (multi-instance support)
- *Justification:* Queue state must survive API restarts and serve sub-millisecond reads under load.

### Payments — Stripe
- **Stripe Connect** (Express accounts) — Venue onboarding + direct payouts
- **Stripe Customers** — Q-user card storage
- **Payment Intents** — Capture flow for cover charges and pre-bookings
- **Webhooks** — `payment_intent.succeeded` gates queue admission
- *Justification:* Connect is purpose-built for marketplace/platform fee models.

### Auth
- **JWT** — 15-min access token, 30-day refresh in httpOnly cookie
- **bcrypt** (12 rounds) — Password hashing
- **Twilio Verify** — SMS OTP for phone verification
- **AWS S3** (or equivalent) — ID/selfie image storage with private ACL

### Infrastructure
- **Docker Compose** — Local dev (Postgres+PostGIS, Redis, API, Frontend)
- **Nginx** — Reverse proxy, SSL termination
- **.env** — All secrets externalized

---

## 2. Full Database Schema

```sql
-- USERS
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT UNIQUE NOT NULL,
  phone           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  date_of_birth   DATE NOT NULL,
  role            TEXT NOT NULL DEFAULT 'user'
                  CHECK (role IN ('user','venue_staff','venue_admin','platform_admin')),
  is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  is_suspended    BOOLEAN NOT NULL DEFAULT FALSE,
  selfie_key      TEXT,           -- S3 key, never returned in API
  id_doc_key      TEXT,           -- S3 key, never returned in API
  stripe_customer_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- BUSINESSES (formerly "venues" — supports any service vertical)
CREATE TABLE businesses (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  address               TEXT NOT NULL,
  city                  TEXT NOT NULL,
  category              TEXT NOT NULL DEFAULT 'nightlife'
                        CHECK (category IN (
                          'nightlife','barbershop','salon','restaurant',
                          'tattoo','medical','clinic','pharmacy','other'
                        )),
  geofence_polygon      GEOMETRY(POLYGON, 4326) NOT NULL,  -- PostGIS
  capacity              INT NOT NULL,
  q_slot_allocation     INT NOT NULL DEFAULT 20
                        CHECK (q_slot_allocation BETWEEN 10 AND 50),
  grace_period_minutes  INT NOT NULL DEFAULT 15
                        CHECK (grace_period_minutes BETWEEN 15 AND 30),
  admission_timer_seconds INT NOT NULL DEFAULT 90,  -- whitepaper: 1min 30sec, configurable
  premium_revenue_split INT NOT NULL DEFAULT 20
                        CHECK (premium_revenue_split BETWEEN 10 AND 50),
  entry_fee_cents       INT NOT NULL DEFAULT 0,     -- cover charge, appointment fee, etc.
  price_per_grace_minute_cents INT NOT NULL DEFAULT 100,
  stripe_account_id     TEXT,     -- Stripe Connect account ID
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Alias for backwards compat in comments: "venues" = "businesses" throughout codebase

-- VENUE STAFF (junction: which users staff which venues)
CREATE TABLE venue_staff (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id   UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'staff'
             CHECK (role IN ('staff','admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(venue_id, user_id)
);

-- QUEUES (one active queue per venue at a time)
CREATE TABLE queues (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id    UUID NOT NULL REFERENCES venues(id),
  opened_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at   TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(venue_id, is_active)  -- enforced via partial index in production
);

-- QUEUE ENTRIES
CREATE TABLE queue_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id        UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES users(id),
  position        INT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'waiting'
                  CHECK (status IN ('waiting','timer_active','admitted','expired','removed')),
  party_size      INT NOT NULL DEFAULT 1,
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  timer_started_at TIMESTAMPTZ,
  admitted_at     TIMESTAMPTZ,
  expired_at      TIMESTAMPTZ,
  UNIQUE(queue_id, user_id, status)
);

-- BOOKINGS (pre-bookings)
CREATE TABLE bookings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id            UUID NOT NULL REFERENCES venues(id),
  user_id             UUID NOT NULL REFERENCES users(id),
  booking_date        DATE NOT NULL,
  booking_time        TIME NOT NULL,
  party_size          INT NOT NULL DEFAULT 1,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','confirmed','checked_in','no_show','cancelled')),
  payment_intent_id   TEXT,
  amount_cents        INT NOT NULL DEFAULT 0,
  grace_deadline_at   TIMESTAMPTZ,  -- computed at confirmation: booking_time + grace_period
  extra_grace_minutes INT NOT NULL DEFAULT 0,  -- purchased premium grace
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TRANSACTIONS
CREATE TABLE transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id),
  venue_id            UUID NOT NULL REFERENCES venues(id),
  type                TEXT NOT NULL
                      CHECK (type IN ('cover','booking','premium_grace','reward_redemption')),
  amount_cents        INT NOT NULL,
  platform_fee_cents  INT NOT NULL,   -- 1% of amount_cents
  venue_net_cents     INT NOT NULL,   -- amount_cents - platform_fee_cents
  stripe_payment_intent_id TEXT,
  paid_out            BOOLEAN NOT NULL DEFAULT FALSE,
  paid_out_at         TIMESTAMPTZ,
  payout_batch_id     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- BEHAVIOR SCORES
CREATE TABLE behavior_scores (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) UNIQUE,
  score          INT NOT NULL DEFAULT 100 CHECK (score >= 0 AND score <= 100),
  last_infraction_at TIMESTAMPTZ,
  last_clean_visit_at TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SCORE EVENTS (audit trail)
CREATE TABLE score_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  venue_id    UUID REFERENCES venues(id),
  delta       INT NOT NULL,       -- negative for docks, positive for recovery
  reason      TEXT NOT NULL,
  score_after INT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- BANS
CREATE TABLE bans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  venue_id    UUID NOT NULL REFERENCES venues(id),
  reason      TEXT NOT NULL,
  issued_by   UUID NOT NULL REFERENCES users(id),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  issued_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lifted_at   TIMESTAMPTZ,
  UNIQUE(user_id, venue_id, is_active)
);

-- RED FLAGS
CREATE TABLE red_flags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) UNIQUE,
  ban_count   INT NOT NULL DEFAULT 0,
  flagged_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

-- REWARD CREDITS
CREATE TABLE reward_credits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) UNIQUE,
  balance_cents INT NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- REWARD TRANSACTIONS
CREATE TABLE reward_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  delta_cents   INT NOT NULL,     -- positive = credit, negative = redemption
  reason        TEXT NOT NULL,    -- 'ad_revenue_share', 'cover_offset', etc.
  balance_after INT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PREMIUM PURCHASES
CREATE TABLE premium_purchases (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id),
  venue_id              UUID NOT NULL REFERENCES venues(id),
  booking_id            UUID REFERENCES bookings(id),
  minutes_purchased     INT NOT NULL,
  price_per_minute_cents INT NOT NULL,
  total_cents           INT NOT NULL,
  venue_share_cents     INT NOT NULL,
  platform_share_cents  INT NOT NULL,
  payment_intent_id     TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ADS
CREATE TABLE ads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_name TEXT NOT NULL,
  image_key       TEXT NOT NULL,  -- S3 key
  target_city     TEXT,
  cpm_cents       INT NOT NULL,   -- cost per mille impressions
  budget_cents    INT NOT NULL,
  spent_cents     INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at       TIMESTAMPTZ,
  ends_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AD IMPRESSIONS (for reward credit calculation)
CREATE TABLE ad_impressions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id      UUID NOT NULL REFERENCES ads(id),
  user_id    UUID NOT NULL REFERENCES users(id),
  venue_id   UUID REFERENCES venues(id),
  reward_cents INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- INDEXES
CREATE INDEX ON queue_entries(queue_id, status);
CREATE INDEX ON queue_entries(user_id);
CREATE INDEX ON bans(user_id, is_active);
CREATE INDEX ON transactions(venue_id, paid_out);
CREATE INDEX ON score_events(user_id);
CREATE UNIQUE INDEX ON queues(venue_id) WHERE is_active = TRUE;
CREATE INDEX ON venues USING GIST(geofence_polygon);
```

---

## 3. API Endpoint Map

### Auth (`/api/auth`)
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/auth/register | Register new user (email+phone+password+DOB) | None |
| POST | /api/auth/verify-otp | Submit phone OTP code | None |
| POST | /api/auth/upload-id | Upload selfie + ID doc for verification | JWT (unverified) |
| POST | /api/auth/login | Email+password login, returns tokens | None |
| POST | /api/auth/refresh | Rotate refresh token | httpOnly cookie |
| POST | /api/auth/logout | Invalidate refresh token | JWT |
| GET  | /api/auth/me | Current user profile | JWT |
| POST | /api/auth/venue/login | Venue staff login | None |

### Users (`/api/users`)
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/users/:id | Get public user profile | JWT |
| PATCH | /api/users/:id | Update profile | JWT (own) |
| GET | /api/users/:id/score | Get behavior score + history | JWT |
| GET | /api/users/:id/rewards | Get reward balance | JWT (own) |
| GET | /api/users/:id/visits | Visit history | JWT (own) |
| GET | /api/users/:id/bans | Active bans | JWT (own or staff) |

### Venues (`/api/venues`)
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/venues | List active venues (with geo filter) | JWT |
| GET | /api/venues/:id | Venue detail + current queue depth | JWT |
| GET | /api/venues/:id/occupancy | Live occupancy count | JWT |
| POST | /api/venues | Create venue | platform_admin |
| PATCH | /api/venues/:id | Update venue settings | venue_admin |
| GET | /api/venues/:id/staff | List staff | venue_admin |
| POST | /api/venues/:id/staff | Add staff member | venue_admin |
| DELETE | /api/venues/:id/staff/:userId | Remove staff | venue_admin |

### Queue (`/api/queues`)
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/queues/:venueId/active | Get active queue state | JWT |
| POST | /api/queues/:venueId/join | Join venue queue | JWT (verified) |
| DELETE | /api/queues/:venueId/leave | Leave queue voluntarily | JWT |
| POST | /api/queues/:venueId/admit/:entryId | Admit user (staff) | venue_staff |
| POST | /api/queues/:venueId/remove/:entryId | Remove user from queue | venue_staff |
| POST | /api/queues/:venueId/confirm-entry | User confirms entry on timer | JWT |
| GET | /api/queues/:venueId/position | Current user's position | JWT |

### Bookings (`/api/bookings`)
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/bookings | Create pre-booking | JWT (verified) |
| GET | /api/bookings/:id | Booking detail | JWT (own or staff) |
| GET | /api/bookings/mine | User's bookings | JWT |
| GET | /api/bookings/venue/:venueId | Venue bookings list | venue_staff |
| POST | /api/bookings/:id/check-in | Staff checks in booking | venue_staff |
| POST | /api/bookings/:id/cancel | Cancel booking | JWT (own) |
| POST | /api/bookings/:id/no-show | Mark no-show (auto or staff) | venue_staff |

### Payments (`/api/payments`)
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/payments/intent | Create payment intent | JWT (verified) |
| POST | /api/payments/webhook | Stripe webhook | Stripe sig |
| POST | /api/payments/premium | Purchase premium grace time | JWT (verified) |
| GET | /api/payments/transactions | User transaction history | JWT |
| GET | /api/payments/venue/:venueId/transactions | Venue transaction history | venue_staff |
| GET | /api/payments/venue/:venueId/payouts | Payout history | venue_admin |
| POST | /api/payments/venue/onboard | Start Stripe Connect onboarding | venue_admin |
| GET | /api/payments/venue/onboard/return | Stripe Connect return URL | venue_admin |
| POST | /api/payments/rewards/redeem | Redeem reward credits | JWT (verified) |

### Bans (`/api/bans`)
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/bans | Issue ban | venue_staff |
| GET | /api/bans/venue/:venueId | All bans at venue | venue_staff |
| GET | /api/bans/user/:userId | All bans for user | venue_staff or own |
| DELETE | /api/bans/:id | Lift ban | venue_admin |

### Admin (`/api/admin`)
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/admin/users/pending | Users awaiting ID verification | platform_admin |
| POST | /api/admin/users/:id/approve | Approve verified user | platform_admin |
| POST | /api/admin/users/:id/reject | Reject verification | platform_admin |
| GET | /api/admin/red-flags | All red-flagged users | platform_admin |
| GET | /api/admin/ads | Ad management | platform_admin |
| POST | /api/admin/ads | Create ad | platform_admin |
| PATCH | /api/admin/ads/:id | Update ad | platform_admin |

### Geo (`/api/geo`)
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | /api/geo/checkin | Report user GPS position | JWT |
| GET | /api/geo/venues/nearby | Venues within radius | JWT |

---

## 4. App Screens

### User App
| Screen | Description |
|--------|-------------|
| Home | Map with live venue markers showing occupancy %; tap to open VenueDetail |
| VenueDetail | Venue info, current queue length, cover charge, Join Q button |
| Queue | Live queue position, real-time updates via socket, exit button |
| QueueTimer | Full-screen 60s countdown when user is #1; swipe-to-confirm entry |
| Booking | Date/time picker, party size, grace period info, payment confirmation |
| BookingConfirm | Booking summary + grace period countdown on day of |
| Profile | Score ring, reward balance, visit history, ban status, settings |
| Login | Email + password login form |
| Register | Multi-step: email/phone/DOB → OTP → ID upload → pending state |
| Verify | Post-registration pending screen; shows verification status |
| Notifications | In-app notification list |

### Venue Admin Panel
| Screen | Description |
|--------|-------------|
| Dashboard | Occupancy bar + queue count + active alerts at a glance |
| QueueManager | Live queue list with admit/remove controls per entry |
| Bookings | Today's pre-bookings list; check-in and no-show controls |
| UserLookup | Search user by name/phone; view score, ban history, red flag status |
| BanManager | Active bans list; issue/lift bans |
| Alerts | Real-time geo-fence alert feed; banned user entry events |
| Settings | Q slot allocation, grace period, premium revenue split |
| Payouts | Payout history, pending balance, Stripe Connect status |

---

## 5. Business Logic Rules

### Behavior Score
- **Default:** 100 on account creation
- **Infractions (score docks):**
  - No-show on booking: −20
  - Miss 60s queue timer: −10
  - Miss grace period: −15
  - Removed from queue by staff: −15
  - Banned from venue: −30
- **Recovery curve:**
  - Score 80–100: +10 per clean visit (full recovery in 2 visits)
  - Score 50–79: +5 per clean visit (slower recovery)
  - Score 1–49: +2 per clean visit (very slow recovery)
  - Score 0: +1 per clean visit (floor recovery; permanent red flag risk)
- **Red flag:** triggered when user accumulates active bans at 3 or more distinct venues
- **Red flag effect:** displayed to all venue staff on queue rows; user notified

### Queue Timer
- When a user reaches position #1, a 60-second countdown starts
- A BullMQ job is enqueued with 60s delay
- If user confirms via `POST /api/queues/:venueId/confirm-entry` before expiry → status = `admitted`
- If job fires and user has not confirmed → status = `expired`, user moved to back of queue, score −10

### Pre-Booking Grace Period
- Venue configures `grace_period_minutes` (15–30)
- At booking confirmation, `grace_deadline_at = booking_date + booking_time + grace_period_minutes`
- A BullMQ job fires at `grace_deadline_at`; if status is not `checked_in` → status = `no_show`, score −15 (dock of −20 for no-show)
- User can purchase premium grace to extend deadline

### Bans & Geo-fence
- Staff issues ban via admin panel → written to `bans` table
- When user reports GPS position, `ST_Contains(venue.geofence_polygon, user_point)` is checked against all venues where user has active ban
- On geo-fence entry: emit `ban:geofence_alert` socket event to venue's staff room; push notification to user
- Ban prevents joining queue at that venue

### Q Slot Allocation
- `venues.q_slot_allocation` (10–50) is the max queue entries simultaneously admitted from Q
- Users attempting to join when `admitted_count >= q_slot_allocation` receive error until spots open

### Fees & Payouts
- Every transaction: `platform_fee_cents = ROUND(amount_cents * 0.01)`; `venue_net_cents = amount_cents - platform_fee_cents`
- Bi-weekly cron (every other Monday 3:00 AM UTC): sum all unpaid `venue_net_cents` per venue → Stripe transfer → mark `paid_out = TRUE`

### Premium Grace
- User selects extra minutes (up to 30 additional)
- Price: venue-set `price_per_minute_cents`
- Total → Stripe charge
- Venue receives `premium_revenue_split`% of total; platform receives remainder + standard 1% fee
- `bookings.extra_grace_minutes` updated → `grace_deadline_at` extended

### Reward Credits
- Users earn credits from ad impressions (configurable CPM share)
- Balance stored in `reward_credits.balance_cents`
- Credits can be applied as discount on cover charges / booking fees
- Ledger tracked in `reward_transactions`

---

## 6. Agent Build Order

```
1. Backend   → core API, DB schema, Redis, sockets, services
2. Auth      → registration, OTP, ID upload, JWT, venue staff auth
3. Payments  → Stripe Connect, fee calculation, payouts, premium, rewards
4. Frontend  → React PWA, all screens, socket integration
5. Admin     → Venue staff panel, real-time alerts
6. QA        → Cross-check all summaries vs spec, issue priority fix list
```

Each layer depends on the previous: Auth extends Backend routes; Payments uses Auth middleware; Frontend calls all APIs; Admin uses venue auth; QA validates the whole stack.
