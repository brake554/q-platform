# Admin Summary

## What Was Built

Tablet/phone venue staff panel — dark, high-contrast, real-time. Works for any business category (nightlife, barbershop, salon, medical, etc.).

### Files Written
```
output/admin/
├── package.json
├── vite.config.js
└── src/
    ├── main.jsx                    — React root
    ├── App.jsx                     — Screen router, socket, ban alert banner tap
    ├── api/client.js               — Admin fetch wrapper with auto-refresh
    ├── hooks/
    │   ├── useAdminAuth.js         — Staff login/logout, session restore
    │   └── useVenueSocket.js       — Business room socket, alerts, occupancy
    ├── screens/
    │   ├── Login.jsx               — Staff login with business ID
    │   ├── Dashboard.jsx           — Occupancy bar + stat cards + nav
    │   ├── QueueManager.jsx        — Live queue list with admit/remove
    │   ├── Bookings.jsx            — Date-filtered booking list + check-in
    │   ├── UserLookup.jsx          — Search user by ID, view score + bans
    │   ├── BanManager.jsx          — View/issue/lift bans
    │   ├── Alerts.jsx              — Geo-fence alert feed
    │   ├── Settings.jsx            — Q slots, grace period, timer, fees
    │   └── Payouts.jsx             — Payout history + Stripe Connect onboard
    └── components/
        ├── OccupancyBar.jsx        — Animated capacity bar with critical threshold warning
        ├── QueueRow.jsx            — Queue entry row with Admit (green, large) + Remove
        ├── AlertBanner.jsx         — Full-width red flash with photo + acknowledge button
        └── ScoreChip.jsx           — Inline score badge (green/yellow/red/skull)
```

---

## Key Interactions

| Interaction | What happens |
|-------------|-------------|
| **Admit** | `POST /api/queues/:id/admit/:entryId` → starts 90s timer → user app shows countdown |
| **Remove** | `POST /api/queues/:id/remove/:entryId` → user removed, score docked −15 |
| **Check In booking** | `POST /api/bookings/:id/check-in` → cancels grace timer |
| **No Show** | `POST /api/bookings/:id/no-show` → score docked −20 |
| **Issue Ban** | `POST /api/bans` → score docked −30, red flag checked |
| **Lift Ban** | `DELETE /api/bans/:id` → red flag re-evaluated |
| **Geo-fence alert** | Real-time via `ban:geofence_alert` socket → red full-width banner |
| **Settings save** | `PATCH /api/businesses/:id` → updates all Q parameters |
| **Stripe onboard** | `POST /api/payments/business/onboard` → redirect to Stripe |

---

## API Endpoints Called

| Screen | Endpoint |
|--------|----------|
| Dashboard | `GET /businesses/:id`, `GET /queues/:id/active` |
| QueueManager | `GET /queues/:id/active`, `POST /queues/:id/admit/:entryId`, `POST /queues/:id/remove/:entryId` |
| Bookings | `GET /bookings/business/:id`, `POST /bookings/:id/check-in`, `POST /bookings/:id/no-show` |
| UserLookup | `GET /users/:id`, `GET /users/:id/score`, `GET /bans/user/:id` |
| BanManager | `GET /bans/business/:id`, `POST /bans`, `DELETE /bans/:id` |
| Settings | `GET /businesses/:id`, `PATCH /businesses/:id` |
| Payouts | `GET /payments/business/:id/payouts`, `POST /payments/business/onboard` |
| Auth | `POST /auth/venue/login`, `POST /auth/refresh`, `POST /auth/logout` |

## Socket Events Consumed

| Event | Effect |
|-------|--------|
| `queue:updated` | Re-fetch queue list |
| `occupancy:update` | Live occupancy bar update |
| `ban:geofence_alert` | Red alert banner + alert feed + nav badge |
