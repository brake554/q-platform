-- Q Platform — PostgreSQL + PostGIS Schema
-- Run once: CREATE EXTENSION IF NOT EXISTS postgis;
--           CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── USERS ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email              TEXT UNIQUE NOT NULL,
  phone              TEXT UNIQUE NOT NULL,
  password_hash      TEXT NOT NULL,
  full_name          TEXT NOT NULL,
  date_of_birth      DATE NOT NULL,
  role               TEXT NOT NULL DEFAULT 'user'
                     CHECK (role IN ('user','business_staff','business_admin','platform_admin')),
  is_verified        BOOLEAN NOT NULL DEFAULT FALSE,
  is_suspended       BOOLEAN NOT NULL DEFAULT FALSE,
  selfie_key         TEXT,      -- S3 object key — NEVER returned in API responses
  id_doc_key         TEXT,      -- S3 object key — NEVER returned in API responses
  stripe_customer_id TEXT,
  profile_photo_url  TEXT,      -- optional public profile photo
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── BUSINESSES (venues, shops, clinics, etc.) ───────────────────────────────
CREATE TABLE IF NOT EXISTS businesses (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                         TEXT NOT NULL,
  address                      TEXT NOT NULL,
  city                         TEXT NOT NULL,
  category                     TEXT NOT NULL DEFAULT 'nightlife'
                               CHECK (category IN (
                                 'nightlife','barbershop','salon','restaurant',
                                 'tattoo','medical','clinic','pharmacy','other'
                               )),
  description                  TEXT,
  cover_image_key              TEXT,   -- S3 key for business banner
  geofence_polygon             GEOMETRY(POLYGON, 4326) NOT NULL,
  capacity                     INT NOT NULL,
  current_occupancy            INT NOT NULL DEFAULT 0 CHECK (current_occupancy >= 0),
  q_slot_allocation            INT NOT NULL DEFAULT 20
                               CHECK (q_slot_allocation BETWEEN 10 AND 50),
  grace_period_minutes         INT NOT NULL DEFAULT 15
                               CHECK (grace_period_minutes BETWEEN 15 AND 30),
  admission_timer_seconds      INT NOT NULL DEFAULT 90,  -- 1min 30sec per whitepaper
  premium_revenue_split        INT NOT NULL DEFAULT 20
                               CHECK (premium_revenue_split BETWEEN 10 AND 50),
  entry_fee_cents              INT NOT NULL DEFAULT 0,
  price_per_grace_minute_cents INT NOT NULL DEFAULT 100,
  stripe_account_id            TEXT,
  is_active                    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── BUSINESS STAFF ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business_staff (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'staff'
                CHECK (role IN ('staff','admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(business_id, user_id)
);

-- ─── QUEUES ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS queues (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id   UUID NOT NULL REFERENCES businesses(id),
  opened_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at     TIMESTAMPTZ,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_queues_active_business
  ON queues(business_id) WHERE is_active = TRUE;

-- ─── QUEUE ENTRIES ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS queue_entries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id         UUID NOT NULL REFERENCES queues(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id),
  position         INT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'waiting'
                   CHECK (status IN ('waiting','timer_active','admitted','expired','removed')),
  party_size       INT NOT NULL DEFAULT 1,
  joined_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  timer_started_at TIMESTAMPTZ,
  admitted_at      TIMESTAMPTZ,
  expired_at       TIMESTAMPTZ
);

-- ─── BOOKINGS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id         UUID NOT NULL REFERENCES businesses(id),
  user_id             UUID NOT NULL REFERENCES users(id),
  booking_date        DATE NOT NULL,
  booking_time        TIME NOT NULL,
  party_size          INT NOT NULL DEFAULT 1,
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','confirmed','checked_in','no_show','cancelled')),
  payment_intent_id   TEXT,
  amount_cents        INT NOT NULL DEFAULT 0,
  grace_deadline_at   TIMESTAMPTZ,
  extra_grace_minutes INT NOT NULL DEFAULT 0,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── TRANSACTIONS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID NOT NULL REFERENCES users(id),
  business_id              UUID NOT NULL REFERENCES businesses(id),
  type                     TEXT NOT NULL
                           CHECK (type IN ('entry_fee','booking','premium_grace','reward_redemption')),
  amount_cents             INT NOT NULL,
  platform_fee_cents       INT NOT NULL,   -- 1% of amount_cents
  business_net_cents       INT NOT NULL,   -- amount_cents - platform_fee_cents
  stripe_payment_intent_id TEXT,
  paid_out                 BOOLEAN NOT NULL DEFAULT FALSE,
  paid_out_at              TIMESTAMPTZ,
  payout_batch_id          TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── BEHAVIOR SCORES ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS behavior_scores (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id) UNIQUE,
  score                INT NOT NULL DEFAULT 100 CHECK (score >= 0 AND score <= 100),
  last_infraction_at   TIMESTAMPTZ,
  last_clean_visit_at  TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── SCORE EVENTS (audit trail) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS score_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id),
  business_id  UUID REFERENCES businesses(id),
  delta        INT NOT NULL,        -- negative = dock, positive = recovery
  reason       TEXT NOT NULL,
  score_after  INT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── BANS ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bans (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id),
  business_id  UUID NOT NULL REFERENCES businesses(id),
  reason       TEXT NOT NULL,
  issued_by    UUID NOT NULL REFERENCES users(id),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  issued_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lifted_at    TIMESTAMPTZ,
  lifted_by    UUID REFERENCES users(id)
);

-- ─── RED FLAGS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS red_flags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) UNIQUE,
  ban_count  INT NOT NULL DEFAULT 0,
  flagged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

-- ─── REWARD CREDITS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reward_credits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) UNIQUE,
  balance_cents INT NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── REWARD TRANSACTIONS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reward_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  delta_cents   INT NOT NULL,        -- positive = credit, negative = redemption
  reason        TEXT NOT NULL,
  balance_after INT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── PREMIUM PURCHASES ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS premium_purchases (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES users(id),
  business_id            UUID NOT NULL REFERENCES businesses(id),
  booking_id             UUID REFERENCES bookings(id),
  minutes_purchased      INT NOT NULL,
  price_per_minute_cents INT NOT NULL,
  total_cents            INT NOT NULL,
  business_share_cents   INT NOT NULL,
  platform_share_cents   INT NOT NULL,
  payment_intent_id      TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── ADS ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_name  TEXT NOT NULL,
  image_key        TEXT NOT NULL,
  target_city      TEXT,
  target_category  TEXT,              -- target specific business categories
  cpm_cents        INT NOT NULL,
  budget_cents     INT NOT NULL,
  spent_cents      INT NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at        TIMESTAMPTZ,
  ends_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── AD IMPRESSIONS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ad_impressions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id         UUID NOT NULL REFERENCES ads(id),
  user_id       UUID NOT NULL REFERENCES users(id),
  business_id   UUID REFERENCES businesses(id),
  reward_cents  INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── INDEXES ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_queue_entries_queue_status ON queue_entries(queue_id, status);
CREATE INDEX IF NOT EXISTS idx_queue_entries_user ON queue_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_bans_user_active ON bans(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_transactions_business_paidout ON transactions(business_id, paid_out);
CREATE INDEX IF NOT EXISTS idx_score_events_user ON score_events(user_id);
CREATE INDEX IF NOT EXISTS idx_businesses_geofence ON businesses USING GIST(geofence_polygon);
CREATE INDEX IF NOT EXISTS idx_bookings_business_date ON bookings(business_id, booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
