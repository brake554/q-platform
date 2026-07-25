# Backend Summary

## What Was Built

A complete Fastify (Node.js) REST API + Socket.io server for the Q platform. Supports all business verticals (nightlife, barbershops, salons, medical, tattoo, restaurants, etc.).

### Files Written
```
output/backend/
├── package.json
├── .env.example
└── src/
    ├── index.js                    — Fastify app, plugin registration, HTTP + Socket.io startup
    ├── db/
    │   ├── schema.sql              — Full PostgreSQL + PostGIS schema
    │   └── client.js               — pg Pool, query(), withTransaction()
    ├── redis/
    │   └── client.js               — ioredis clients, key helpers
    ├── routes/
    │   ├── queue.js                — Queue join/leave/admit/remove/confirm-entry
    │   ├── venue.js                — Business CRUD, staff management, geo endpoints
    │   ├── users.js                — User profiles, scores, visits, admin approval
    │   ├── bookings.js             — Pre-booking, check-in, no-show, cancellation
    │   └── rewards.js              — Ban issuance/lift, ad impressions, reward redemption
    ├── services/
    │   ├── queueService.js         — Queue state machine (join→timer→admit/expire)
    │   ├── geoService.js           — PostGIS geo-fence, occupancy tracking, ban alerts
    │   ├── scoringService.js       — Score default 100, infraction docking, recovery curve
    │   ├── timerService.js         — BullMQ admission timer (90s) + grace timer
    │   └── banService.js           — Issue/lift bans, red-flag threshold check
    ├── sockets/
    │   └── index.js                — Socket.io server, room setup, Redis adapter
    └── middleware/
        ├── auth.js                 — JWT verification, requireAuth, requireVerified, requirePlatformAdmin
        └── venueAuth.js            — requireBusinessStaff, requireBusinessAdmin
```

---

## Socket Events Emitted by Server

| Event | Payload | Room | Description |
|-------|---------|------|-------------|
| `queue:updated` | `{ businessId }` | `business:{id}` | Queue state changed — clients should re-fetch |
| `queue:timer_start` | `{ entryId, businessId, seconds, startedAt }` | `user:{id}` | Admission countdown started |
| `queue:timer_expired` | `{ businessId, message, scoreDock }` | `user:{id}` | Timer missed — user moved to back |
| `queue:admitted` | `{ businessId, message, newScore }` | `user:{id}` | User confirmed entry successfully |
| `queue:removed` | `{ businessId, message, scoreDock }` | `user:{id}` | Staff removed user from queue |
| `occupancy:update` | `{ businessId, occupancy }` | `business:{id}` | Live occupancy changed |
| `ban:geofence_alert` | `{ businessId, businessName, userId, userName, photoUrl, score, banReason, timestamp }` | `business:{id}` | Banned user entered geo-fence |
| `ban:entry_warning` | `{ businessId, businessName, message }` | `user:{id}` | User notified of their own ban on entry |
| `ban:issued` | `{ businessId, reason, isRedFlagged, message }` | `user:{id}` | Ban issued to user |
| `ban:lifted` | `{ businessId, message }` | `user:{id}` | Ban lifted |
| `booking:no_show` | `{ bookingId, message, scoreDock }` | `user:{id}` | Booking marked no-show |
| `booking:checked_in` | `{ bookingId }` | `user:{id}` | Booking checked in successfully |

## Socket Events Received from Clients

| Event | Payload | Description |
|-------|---------|-------------|
| `join:user_room` | `{ userId }` | User joins their private notification room |
| `join:business_room` | `{ businessId }` | Staff joins business operations room |
| `leave:business_room` | `{ businessId }` | Staff leaves business room |

---

## Environment Variables Required

```
PORT
NODE_ENV
FRONTEND_URL
ADMIN_URL
DATABASE_URL
REDIS_URL
JWT_SECRET
JWT_REFRESH_SECRET
JWT_ACCESS_EXPIRES_IN
JWT_REFRESH_EXPIRES_IN
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_CONNECT_CLIENT_ID
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_VERIFY_SERVICE_SID
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
AWS_S3_BUCKET
PLATFORM_FEE_PERCENT
PAYOUT_CRON_SCHEDULE
GOOGLE_MAPS_API_KEY
```

---

## Key Design Decisions

- **Timer:** 90 seconds (1 min 30 sec per whitepaper). Configurable per business via `businesses.admission_timer_seconds`.
- **Business-agnostic:** All code uses `business_id` / `businesses` table — works for nightlife, medical, barbershops, etc.
- **BullMQ for timers:** Timers survive server restarts. Jobs stored in Redis.
- **PostGIS:** Geo-fence containment via `ST_Contains()`. Entry/exit detection cached in Redis (`q:in_fence:{businessId}:{userId}`).
- **Occupancy:** Tracked in Redis (fast reads) and synced to `businesses.current_occupancy` (persistent).
- **Score recovery curve:** 80–100 → +10/visit; 50–79 → +5/visit; 20–49 → +2/visit; 1–19 → +1/visit.
- **Red flag:** ≥3 active bans across distinct businesses.
