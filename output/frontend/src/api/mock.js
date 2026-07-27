/**
 * Mock API — Demo Mode
 *
 * Intercepts all API calls and returns realistic fake data.
 * No backend required. State persists in sessionStorage.
 */

import { BUSINESSES as SEED_BUSINESSES } from '../data/stjohns.js';
import { venuesContaining } from '../lib/geofence.js';

// ── Persistent demo state ──────────────────────────────────────────────────
function load(key, def) {
  try { return JSON.parse(sessionStorage.getItem('q_mock_' + key)) ?? def; } catch { return def; }
}
function save(key, val) {
  sessionStorage.setItem('q_mock_' + key, JSON.stringify(val));
}

const DEMO_USER = {
  id: 'demo-user-001',
  email: 'demo@q.app',
  phone: '+14165550001',
  full_name: 'Demo User',
  role: 'user',
  is_verified: true,
  profile_photo_url: null,
  score: 87,
  reward_balance_cents: 340,
  is_red_flagged: false,
  created_at: new Date().toISOString(),
};

const BUSINESSES = SEED_BUSINESSES.map((b) => ({ ...b }));

// ── Queue state ────────────────────────────────────────────────────────────
function getQueues() { return load('queues', {}); }
function saveQueues(q) { save('queues', q); }

function getQueueEntry(bizId) {
  return getQueues()[bizId] || null;
}

function joinBizQueue(bizId, partySize) {
  const queues = getQueues();
  const biz = BUSINESSES.find(b => b.id === bizId);
  const position = (biz?.queue_length || 0) + 1;
  queues[bizId] = {
    id: 'entry-' + Date.now(),
    queue_id: 'q-' + bizId,
    position,
    status: 'waiting',
    party_size: partySize,
    joined_at: new Date().toISOString(),
    businessId: bizId,
  };
  // Bump queue_length on the in-memory business
  if (biz) biz.queue_length = (biz.queue_length || 0) + 1;
  saveQueues(queues);
  return queues[bizId];
}

function leaveBizQueue(bizId) {
  const queues = getQueues();
  const biz = BUSINESSES.find(b => b.id === bizId);
  if (biz && biz.queue_length > 0) biz.queue_length--;
  delete queues[bizId];
  saveQueues(queues);
}

// ── Registered users (demo registration) ──────────────────────────────────
function getUsers() { return load('users', { 'demo@q.app': { ...DEMO_USER, password: 'demo1234' } }); }
function saveUsers(u) { save('users', u); }

// ── Bookings ───────────────────────────────────────────────────────────────
function getBookings() { return load('bookings', []); }
function saveBookings(b) { save('bookings', b); }


// ── Live venue state (occupancy / queue length) ────────────────────────────
// Mutations from the geofence engine persist for the session so the map keeps
// telling a consistent story across reloads.
function getOverrides() { return load('biz_state', {}); }
function saveOverrides(o) { save('biz_state', o); }

function recalcPct(b) {
  b.occupancy_pct = b.capacity > 0
    ? Math.max(0, Math.min(100, Math.round((b.current_occupancy / b.capacity) * 100)))
    : 0;
}

function persistBiz(b) {
  const o = getOverrides();
  o[b.id] = { current_occupancy: b.current_occupancy, queue_length: b.queue_length };
  saveOverrides(o);
}

(function applyStoredState() {
  const o = getOverrides();
  BUSINESSES.forEach((b) => {
    const ov = o[b.id];
    if (ov) {
      b.current_occupancy = ov.current_occupancy;
      b.queue_length = ov.queue_length;
      recalcPct(b);
    }
  });
})();

function hasRoom(b) { return b.current_occupancy < b.capacity; }

function admitOne(b) {
  b.current_occupancy = Math.min(b.capacity, b.current_occupancy + 1);
  if (b.queue_length > 0) b.queue_length -= 1;
  recalcPct(b);
  persistBiz(b);
}

function releaseOne(b) {
  b.current_occupancy = Math.max(0, b.current_occupancy - 1);
  recalcPct(b);
  persistBiz(b);
}

// ── Geofence engine ────────────────────────────────────────────────────────
function getInside() { return load('geo_inside', []); }
function saveInside(ids) { save('geo_inside', ids); }

// Venues we're currently counted inside of — i.e. we were admitted through the
// Q and haven't left yet. Only these decrement occupancy on the way out.
function getAdmittedAt() { return load('geo_admitted', []); }
function saveAdmittedAt(ids) { save('geo_admitted', ids); }

/**
 * The fence only answers two questions: did you arrive, and did you leave?
 *
 *  - Arriving is how you claim a Q spot you already joined by hand. It never
 *    joins a Q for you, and walking past a venue you aren't queued for does
 *    nothing at all.
 *  - Leaving releases the spot you were occupying, which is what lets the next
 *    person in that venue's Q be admitted.
 */
function processGeofence(lat, lng) {
  const prevInside = getInside();
  const nowInside = venuesContaining(lat, lng, BUSINESSES, prevInside);
  const entered = nowInside.filter((id) => !prevInside.includes(id));
  const exited = prevInside.filter((id) => !nowInside.includes(id));
  saveInside(nowInside);

  const events = [];
  const queues = getQueues();
  let admittedAt = getAdmittedAt();
  let queueUpdate = null;

  // ── Arrivals ─────────────────────────────────────────────────────────────
  for (const id of entered) {
    const b = BUSINESSES.find((x) => x.id === id);
    if (!b) continue;
    const entry = queues[id];

    // Not in this venue's Q? Then arriving means nothing — you join by hand.
    if (!entry || entry.status === 'admitted') continue;

    if (entry.position > 1) {
      events.push({ type: 'arrived_early', businessId: id, businessName: b.name,
        message: `You're at ${b.name}, but you're #${entry.position} in the Q. Hang tight.` });
    } else if (!hasRoom(b)) {
      events.push({ type: 'arrived_early', businessId: id, businessName: b.name,
        message: `You're at ${b.name} and next in line — waiting on a spot to free up.` });
    } else {
      // You're at the front and there's room: your arrival claims the spot.
      admitOne(b);
      delete queues[id];
      saveQueues(queues);
      admittedAt = [...new Set([...admittedAt, id])];
      saveAdmittedAt(admittedAt);
      events.push({ type: 'admitted', businessId: id, businessName: b.name,
        message: `You're in at ${b.name}. Welcome.` });
    }
  }

  // ── Departures ───────────────────────────────────────────────────────────
  for (const id of exited) {
    const b = BUSINESSES.find((x) => x.id === id);
    if (!b) continue;

    // Only give a spot back if we were actually occupying one.
    if (!admittedAt.includes(id)) continue;

    releaseOne(b);
    admittedAt = admittedAt.filter((x) => x !== id);
    saveAdmittedAt(admittedAt);
    events.push({ type: 'exited', businessId: id, businessName: b.name,
      message: `Left ${b.name} — your spot is back in the pool.` });

    // The spot you freed is what lets the next person in.
    if (b.queue_length > 0) {
      admitOne(b);
      events.push({ type: 'slot_filled', businessId: id, businessName: b.name,
        message: `A spot opened at ${b.name} — next in the Q was let in.` });
    }

    // If we're waiting in this venue's Q ourselves, we just moved up.
    const ourEntry = queues[id];
    if (ourEntry && ourEntry.position > 1) {
      ourEntry.position -= 1;
      saveQueues(queues);
      queueUpdate = { businessId: id, position: ourEntry.position };
      if (ourEntry.position === 1) {
        events.push({ type: 'your_turn', businessId: id, businessName: b.name,
          message: `You're next at ${b.name}. Head over — ${b.admission_timer_seconds}s once you arrive.` });
      }
    }
  }

  return {
    events,
    inside: nowInside,
    queueUpdate,
    businesses: BUSINESSES.map((b) => ({
      id: b.id, current_occupancy: b.current_occupancy,
      occupancy_pct: b.occupancy_pct, queue_length: b.queue_length,
    })),
  };
}


/**
 * Demo helper: another patron walks out of a venue.
 *
 * This is the event the real system would get from *their* phone crossing the
 * fence outward. It frees a spot, which lets the next person in that venue's Q
 * be admitted — and moves you up if you're waiting in it.
 */
function simulatePatronLeaves(bizId) {
  const b = BUSINESSES.find((x) => x.id === bizId);
  if (!b) return { events: [], queueUpdate: null, businesses: [] };

  const events = [];
  const queues = getQueues();
  let queueUpdate = null;

  if (b.current_occupancy <= 0) {
    events.push({ type: 'info', businessId: bizId, businessName: b.name,
      message: `${b.name} is already empty.` });
  } else {
    releaseOne(b);
    events.push({ type: 'patron_left', businessId: bizId, businessName: b.name,
      message: `Someone left ${b.name}.` });

    if (b.queue_length > 0) {
      admitOne(b);
      events.push({ type: 'slot_filled', businessId: bizId, businessName: b.name,
        message: `A spot opened at ${b.name} — next in the Q was let in.` });
    }

    const entry = queues[bizId];
    if (entry && entry.status !== 'admitted' && entry.position > 1) {
      entry.position -= 1;
      saveQueues(queues);
      queueUpdate = { businessId: bizId, position: entry.position };
      if (entry.position === 1) {
        events.push({ type: 'your_turn', businessId: bizId, businessName: b.name,
          message: `You're next at ${b.name}. Head over — ${b.admission_timer_seconds}s once you arrive.` });
      }
    }
  }

  return {
    events,
    queueUpdate,
    inside: getInside(),
    businesses: BUSINESSES.map((x) => ({
      id: x.id, current_occupancy: x.current_occupancy,
      occupancy_pct: x.occupancy_pct, queue_length: x.queue_length,
    })),
  };
}

// ── Route handler ──────────────────────────────────────────────────────────
export async function mockFetch(path, method, body) {
  await delay(120); // Simulate network latency

  // ── Auth ────────────────────────────────────────────────────────────────
  if (path === '/auth/login' && method === 'POST') {
    const users = getUsers();
    const user = Object.values(users).find(u => u.email === body.email);
    if (!user || user.password !== body.password) {
      return err(401, 'Invalid credentials');
    }
    save('session_user', sanitize(user));
    return ok({ accessToken: 'demo-token', user: sanitize(user) });
  }

  if (path === '/auth/register' && method === 'POST') {
    const users = getUsers();
    if (users[body.email]) return err(409, 'That email is already registered');

    // Age gate
    const age = (Date.now() - new Date(body.date_of_birth)) / (1000 * 60 * 60 * 24 * 365);
    if (age < 18) return err(400, 'You must be 18 or older to use Q');

    const newUser = {
      id: 'user-' + Date.now(),
      email: body.email,
      phone: body.phone,
      full_name: body.full_name,
      role: 'user',
      is_verified: false,
      profile_photo_url: null,
      score: 100,
      reward_balance_cents: 0,
      is_red_flagged: false,
      password: body.password,
      created_at: new Date().toISOString(),
    };
    users[body.email] = newUser;
    saveUsers(users);
    save('pending_phone', body.phone);
    return ok({ userId: newUser.id, nextStep: 'verify-otp' });
  }

  if (path === '/auth/verify-otp' && method === 'POST') {
    // Accept any 4+ digit code in demo mode
    if (body.code.length < 4) return err(400, 'Invalid code');
    return ok({ userId: 'demo', nextStep: 'upload-id' });
  }

  if (path === '/auth/upload-id' && method === 'POST') {
    return ok({ status: 'pending_review', message: 'Demo mode: auto-approved!' });
  }

  if (path === '/auth/refresh' && method === 'POST') {
    const current = load('session_user', null);
    if (!current) return err(401, 'No session');
    return ok({ accessToken: 'demo-token' });
  }

  if (path === '/auth/me' && method === 'GET') {
    const current = load('session_user', DEMO_USER);
    return ok(current);
  }

  if (path === '/auth/logout' && method === 'POST') {
    sessionStorage.removeItem('q_mock_session_user');
    return ok({ success: true });
  }

  // ── Geo / Businesses ────────────────────────────────────────────────────
  if (path.startsWith('/geo/businesses/nearby') && method === 'GET') {
    return ok({ businesses: BUSINESSES });
  }

  if (path === '/sim/patron-leaves' && method === 'POST') {
    return ok(simulatePatronLeaves(body?.businessId));
  }

  if (path === '/geo/checkin' && method === 'POST') {
    if (typeof body?.lat !== 'number' || typeof body?.lng !== 'number') {
      return ok({ events: [], inside: [], queueUpdate: null, businesses: [] });
    }
    return ok(processGeofence(body.lat, body.lng));
  }

  if (path === '/businesses' && method === 'GET') {
    return ok({ businesses: BUSINESSES });
  }

  if (path.match(/^\/businesses\/[\w-]+$/) && method === 'GET') {
    const id = path.split('/').pop();
    const biz = BUSINESSES.find(b => b.id === id);
    if (!biz) return err(404, 'Business not found');
    return ok(biz);
  }

  // ── Queue ───────────────────────────────────────────────────────────────
  if (path.match(/^\/queues\/[\w-]+\/join$/) && method === 'POST') {
    const bizId = path.split('/')[2];
    const entry = joinBizQueue(bizId, body?.partySize || 1);
    return ok({ entryId: entry.id, position: entry.position });
  }

  if (path.match(/^\/queues\/[\w-]+\/leave$/) && method === 'DELETE') {
    const bizId = path.split('/')[2];
    leaveBizQueue(bizId);
    return ok({ success: true });
  }

  if (path.match(/^\/queues\/[\w-]+\/position$/) && method === 'GET') {
    const bizId = path.split('/')[2];
    const entry = getQueueEntry(bizId);
    if (!entry) return err(404, 'Not in queue');
    return ok(entry);
  }

  if (path.match(/^\/queues\/[\w-]+\/active$/) && method === 'GET') {
    return ok({ entries: [] });
  }

  if (path.match(/^\/queues\/[\w-]+\/confirm-entry$/) && method === 'POST') {
    const bizId = path.split('/')[2];
    leaveBizQueue(bizId);
    return ok({ admitted: true, newScore: 90 });
  }

  // ── Bookings ────────────────────────────────────────────────────────────
  if (path === '/bookings' && method === 'POST') {
    const biz = BUSINESSES.find(b => b.id === body.businessId);
    const graceMins = biz?.grace_period_minutes || 15;
    const deadline = new Date(`${body.booking_date}T${body.booking_time}`);
    deadline.setMinutes(deadline.getMinutes() + graceMins);
    const booking = {
      id: 'booking-' + Date.now(),
      ...body,
      status: 'confirmed',
      grace_deadline_at: deadline.toISOString(),
      amount_cents: (biz?.entry_fee_cents || 0) * (body.party_size || 1),
    };
    const bookings = getBookings();
    bookings.push(booking);
    saveBookings(bookings);
    return ok(booking);
  }

  if (path === '/bookings/mine' && method === 'GET') {
    return ok({ bookings: getBookings() });
  }

  // ── User ────────────────────────────────────────────────────────────────
  if (path.match(/^\/users\/[\w-]+\/score$/) && method === 'GET') {
    return ok({
      score: DEMO_USER.score,
      history: [
        { delta: -10, reason: 'MISS_ADMISSION_TIMER', business_name: 'Marquee Club', score_after: 87, created_at: new Date(Date.now() - 86400000).toISOString() },
        { delta: 10, reason: 'CLEAN_VISIT_RECOVERY', business_name: 'The Terrace Rooftop Bar', score_after: 97, created_at: new Date(Date.now() - 172800000).toISOString() },
        { delta: -30, reason: 'BANNED_FROM_BUSINESS', business_name: 'Marquee Club', score_after: 87, created_at: new Date(Date.now() - 259200000).toISOString() },
      ],
    });
  }

  if (path.match(/^\/users\/[\w-]+\/rewards$/) && method === 'GET') {
    return ok({ balance_cents: DEMO_USER.reward_balance_cents, transactions: [
      { delta_cents: 20, reason: 'ad_revenue_share', balance_after: 340, created_at: new Date().toISOString() },
    ]});
  }

  if (path.match(/^\/users\/[\w-]+\/visits$/) && method === 'GET') {
    return ok({ visits: [
      { business_name: 'The Terrace Rooftop Bar', city: 'Toronto', category: 'nightlife', admitted_at: new Date(Date.now() - 172800000).toISOString() },
      { business_name: 'Fresh Cuts Barbershop', city: 'Toronto', category: 'barbershop', admitted_at: new Date(Date.now() - 604800000).toISOString() },
    ]});
  }

  if (path.match(/^\/bans\/user\//) && method === 'GET') {
    return ok({ bans: [] });
  }

  if (path.match(/^\/users\/[\w-]+$/) && method === 'GET') {
    return ok(sanitize(DEMO_USER));
  }

  // ── Payments ─────────────────────────────────────────────────────────────
  if (path === '/payments/intent' && method === 'POST') {
    return ok({ clientSecret: 'demo_secret', paymentIntentId: 'demo_pi', free: body.amountCents === 0 });
  }

  if (path === '/payments/transactions' && method === 'GET') {
    return ok({ transactions: [] });
  }

  if (path === '/rewards/redeem' && method === 'POST') {
    return ok({ remaining_balance: Math.max(0, DEMO_USER.reward_balance_cents - body.amountCents) });
  }

  // Fallback
  console.warn('[Mock] Unhandled:', method, path);
  return ok({});
}

// ── Helpers ──────────────────────────────────────────────────────────────
function ok(data) { return { ok: true, status: 200, data }; }
function err(status, message) { return { ok: false, status, data: { error: message } }; }
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function sanitize(u) {
  const { password, selfie_key, id_doc_key, ...safe } = u;
  return safe;
}
