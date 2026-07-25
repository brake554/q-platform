/**
 * Mock API — Demo Mode
 *
 * Intercepts all API calls and returns realistic fake data.
 * No backend required. State persists in sessionStorage.
 */

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

const BUSINESSES = [
  {
    id: 'biz-001', name: 'Marquee Club', category: 'nightlife',
    address: '132 Queen St W', city: 'Toronto',
    capacity: 300, current_occupancy: 241, occupancy_pct: 80,
    q_slot_allocation: 30, entry_fee_cents: 2000, queue_length: 12,
    admission_timer_seconds: 90, grace_period_minutes: 15,
    price_per_grace_minute_cents: 100, premium_revenue_split: 20,
    description: 'Toronto\'s premier nightclub. Live DJs every weekend.',
    distance_meters: 180,
  },
  {
    id: 'biz-002', name: 'Fresh Cuts Barbershop', category: 'barbershop',
    address: '88 Spadina Ave', city: 'Toronto',
    capacity: 8, current_occupancy: 7, occupancy_pct: 88,
    q_slot_allocation: 4, entry_fee_cents: 0, queue_length: 5,
    admission_timer_seconds: 120, grace_period_minutes: 15,
    price_per_grace_minute_cents: 50, premium_revenue_split: 20,
    description: 'Walk-in and appointment cuts. No waiting around.',
    distance_meters: 420,
  },
  {
    id: 'biz-003', name: 'Studio Glow Salon', category: 'salon',
    address: '210 King St E', city: 'Toronto',
    capacity: 12, current_occupancy: 4, occupancy_pct: 33,
    q_slot_allocation: 6, entry_fee_cents: 0, queue_length: 2,
    admission_timer_seconds: 90, grace_period_minutes: 20,
    price_per_grace_minute_cents: 75, premium_revenue_split: 25,
    description: 'Full service hair salon. Colour specialists on site.',
    distance_meters: 650,
  },
  {
    id: 'biz-004', name: 'Ink Society Tattoo', category: 'tattoo',
    address: '44 Ossington Ave', city: 'Toronto',
    capacity: 6, current_occupancy: 6, occupancy_pct: 100,
    q_slot_allocation: 3, entry_fee_cents: 0, queue_length: 8,
    admission_timer_seconds: 90, grace_period_minutes: 30,
    price_per_grace_minute_cents: 100, premium_revenue_split: 30,
    description: 'Custom tattoo studio. Walk-ins welcome when space allows.',
    distance_meters: 890,
  },
  {
    id: 'biz-005', name: 'Uptown Medical Clinic', category: 'clinic',
    address: '555 University Ave', city: 'Toronto',
    capacity: 20, current_occupancy: 11, occupancy_pct: 55,
    q_slot_allocation: 10, entry_fee_cents: 0, queue_length: 6,
    admission_timer_seconds: 180, grace_period_minutes: 20,
    price_per_grace_minute_cents: 0, premium_revenue_split: 10,
    description: 'Walk-in clinic. Q from anywhere — we\'ll buzz you when ready.',
    distance_meters: 1100,
  },
  {
    id: 'biz-006', name: 'The Terrace Rooftop Bar', category: 'nightlife',
    address: '1 Richmond St W', city: 'Toronto',
    capacity: 150, current_occupancy: 45, occupancy_pct: 30,
    q_slot_allocation: 25, entry_fee_cents: 1000, queue_length: 0,
    admission_timer_seconds: 90, grace_period_minutes: 15,
    price_per_grace_minute_cents: 100, premium_revenue_split: 20,
    description: 'Rooftop cocktail bar with city views.',
    distance_meters: 1400,
  },
];

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

  if (path === '/geo/checkin' && method === 'POST') {
    return ok({ alerts: [], occupancyChanges: [] });
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
