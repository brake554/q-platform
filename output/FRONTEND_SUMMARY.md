# Frontend Summary

## What Was Built

React 18 PWA (Vite) — dark-themed, mobile-first user app for Q platform. Supports all business verticals.

### Files Written
```
output/frontend/
├── package.json
├── vite.config.js                  — Vite + PWA plugin + API proxy
├── public/manifest.json            — PWA manifest (installable)
└── src/
    ├── main.jsx                    — React root, global CSS reset
    ├── App.jsx                     — Router, Socket.io init, auth guard
    ├── api/client.js               — Fetch wrapper, auto-token-refresh, multipart upload
    ├── store/index.js              — Zustand store (auth, queue, geo, notifications)
    ├── hooks/
    │   ├── useAuth.js              — Login, logout, register, OTP, ID upload
    │   ├── useGeo.js               — GPS watch, position reporting, nearby fetch
    │   └── useQueue.js             — Join/leave/confirm, socket listeners
    ├── screens/
    │   ├── Home.jsx                — Map + list view, category filter, venue markers
    │   ├── VenueDetail.jsx         — Business page, party size, join Q button
    │   ├── Queue.jsx               — Live position screen with socket updates
    │   ├── Booking.jsx             — Pre-booking form + confirmation
    │   ├── Profile.jsx             — Score ring, rewards, visits, bans
    │   ├── Login.jsx               — Email + password login
    │   ├── Register.jsx            — 3-step: details → OTP → ID upload → pending
    │   └── Verify.jsx              — Pending verification status screen
    └── components/
        ├── QueueTimer.jsx          — Full-screen 90s countdown + swipe-to-confirm
        ├── ScoreBadge.jsx          — Animated score ring (green/yellow/red/skull)
        ├── VenueCard.jsx           — Business listing card with occupancy bar
        └── Notifications.jsx       — Toast overlay + socket event listener
```

---

## All Screens

| Screen | Route | Description |
|--------|-------|-------------|
| Home | `/` | Map with live venue markers + list view + category filter |
| VenueDetail | `/business/:id` | Business page, queue join, party size |
| Queue | `/queue/:id` | Live position + 90s timer overlay when #1 |
| Booking | `/booking/:id` | Pre-booking date/time/party/payment |
| Profile | `/profile` | Score ring, reward balance, history, bans |
| Login | `/login` | Email + password |
| Register | `/register` | 3-step: details → OTP → ID upload |
| Verify | `/verify` | Pending verification holding screen |

---

## API Endpoints Called

| Screen/Hook | Endpoint |
|-------------|----------|
| App.jsx | POST `/auth/refresh`, GET `/auth/me` |
| useAuth | POST `/auth/login`, POST `/auth/register`, POST `/auth/verify-otp`, POST `/auth/upload-id`, POST `/auth/logout`, POST `/auth/venue/login` |
| useGeo | GET `/geo/businesses/nearby`, POST `/geo/checkin` |
| useQueue | GET `/queues/:id/position`, POST `/queues/:id/join`, DELETE `/queues/:id/leave`, POST `/queues/:id/confirm-entry` |
| Home | (via useGeo) |
| VenueDetail | GET `/businesses/:id` |
| Queue | GET `/businesses/:id` |
| Booking | GET `/businesses/:id`, POST `/bookings` |
| Profile | GET `/users/:id/score`, GET `/users/:id/rewards`, GET `/users/:id/visits`, GET `/bans/user/:id` |

---

## Socket Events Consumed

| Event | Handler |
|-------|---------|
| `queue:updated` | Re-fetch position |
| `queue:timer_start` | Show QueueTimer overlay |
| `queue:timer_expired` | Hide timer, refetch position, show toast |
| `queue:admitted` | Clear queue state, show success toast |
| `queue:removed` | Clear queue state, show error toast |
| `ban:entry_warning` | Show error toast |
| `ban:issued` | Show error toast |
| `ban:lifted` | Show success toast |
| `booking:no_show` | Show warning toast |

---

## Design Decisions

- **Token storage:** Access token in Zustand (memory only, NOT localStorage) — prevents XSS token theft
- **Map:** Google Maps via `@vis.gl/react-google-maps` — dark mode, custom markers showing occupancy %
- **Timer:** `QueueTimer` is a full-screen modal overlay; uses `framer-motion` for urgency animations. Red pulsing when ≤30s
- **Score ring:** SVG arc with animated stroke-dashoffset; skull icon for red-flagged users
- **Nav:** Bottom tab bar hidden on auth screens. Only 2 tabs (Map, Profile) — simple enough for drunk/dark venue use
- **Category filter:** Horizontal scroll chips on home screen — covers all business verticals
- **PWA:** Installable via manifest.json, service worker via Workbox (vite-plugin-pwa), dark splash screen
