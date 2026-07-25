/**
 * Auth Service
 *
 * Core user authentication logic:
 * - Registration with age gate
 * - Login with bcrypt comparison
 * - Venue staff auth with role-based JWT claims
 */

import bcrypt from 'bcrypt';
import { query } from '../../../backend/src/db/client.js';
import { sendOTP } from './verificationService.js';
import { normalizePhone, isOfLegalAge } from '../utils/validators.js';

const SALT_ROUNDS = 12;

/**
 * Register a new user.
 * Step 1 of the registration flow: create user in 'unverified' state, send OTP.
 *
 * @param {{ email, phone, password, full_name, date_of_birth }} data
 * @returns {{ userId: string }}
 */
export async function registerUser({ email, phone, password, full_name, date_of_birth }) {
  // Age gate — must be 18+
  if (!isOfLegalAge(date_of_birth)) {
    throw Object.assign(new Error('You must be 18 or older to use Q'), { statusCode: 400 });
  }

  const normalizedPhone = normalizePhone(phone);
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  let userId;
  try {
    const { rows } = await query(`
      INSERT INTO users (email, phone, password_hash, full_name, date_of_birth)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [email.toLowerCase(), normalizedPhone, passwordHash, full_name, date_of_birth]);
    userId = rows[0].id;
  } catch (err) {
    if (err.code === '23505') {
      // Unique constraint violation — email or phone already exists
      const field = err.detail?.includes('email') ? 'email' : 'phone number';
      throw Object.assign(new Error(`That ${field} is already registered`), { statusCode: 409 });
    }
    throw err;
  }

  // Initialize behavior score
  await query(
    'INSERT INTO behavior_scores (user_id) VALUES ($1) ON CONFLICT DO NOTHING',
    [userId]
  );

  // Initialize reward credits
  await query(
    'INSERT INTO reward_credits (user_id) VALUES ($1) ON CONFLICT DO NOTHING',
    [userId]
  );

  // Send OTP for phone verification
  await sendOTP(normalizedPhone);

  return { userId };
}

/**
 * Verify phone OTP — marks phone as verified, user enters 'pending ID' state.
 * @param {string} phone
 * @param {string} code
 * @returns {{ userId: string }}
 */
export async function verifyPhone(phone, code) {
  const { checkOTP } = await import('./verificationService.js');
  const normalizedPhone = normalizePhone(phone);
  const { valid } = await checkOTP(normalizedPhone, code);

  if (!valid) {
    throw Object.assign(new Error('Invalid or expired OTP'), { statusCode: 400 });
  }

  const { rows } = await query(
    'SELECT id FROM users WHERE phone = $1',
    [normalizedPhone]
  );
  if (!rows[0]) throw Object.assign(new Error('User not found'), { statusCode: 404 });

  // Phone confirmed — user still needs ID upload + admin approval before is_verified = TRUE
  // We don't flip is_verified here; that happens after admin approval.
  return { userId: rows[0].id };
}

/**
 * Store S3 keys for selfie and ID doc.
 * Called after Step 2 (file upload) — user state moves to 'pending admin review'.
 * @param {string} userId
 * @param {string} selfieKey - S3 key
 * @param {string} idDocKey  - S3 key
 */
export async function storeVerificationKeys(userId, selfieKey, idDocKey) {
  await query(`
    UPDATE users
    SET selfie_key = $2, id_doc_key = $3, updated_at = NOW()
    WHERE id = $1
  `, [userId, selfieKey, idDocKey]);
}

/**
 * Login with email + password.
 * Returns user record on success.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<object>} User row
 */
export async function loginUser(email, password) {
  const { rows } = await query(`
    SELECT id, email, phone, password_hash, full_name, role,
           is_verified, is_suspended
    FROM users WHERE email = $1
  `, [email.toLowerCase()]);

  if (!rows[0]) {
    // Timing-safe: run bcrypt even if user not found to prevent user enumeration
    await bcrypt.compare(password, '$2b$12$invalidhashthatisjustherefortimingg');
    throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
  }

  const user = rows[0];

  if (user.is_suspended) {
    throw Object.assign(new Error('Account suspended. Contact support.'), { statusCode: 403 });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw Object.assign(new Error('Invalid credentials'), { statusCode: 401 });
  }

  // Get current score
  const { rows: scoreRows } = await query(
    'SELECT score FROM behavior_scores WHERE user_id = $1',
    [user.id]
  );
  user.score = scoreRows[0]?.score ?? 100;

  return user;
}

/**
 * Venue/business staff login.
 * Verifies staff membership at the given business and adds staff-specific JWT claims.
 * @param {string} email
 * @param {string} password
 * @param {string} businessId
 * @returns {Promise<{ user: object, staffRole: string }>}
 */
export async function loginStaff(email, password, businessId) {
  const user = await loginUser(email, password);

  // Check staff membership
  const { rows } = await query(`
    SELECT role FROM business_staff
    WHERE business_id = $1 AND user_id = $2
  `, [businessId, user.id]);

  if (!rows[0] && user.role !== 'platform_admin') {
    throw Object.assign(
      new Error('You do not have staff access to this business'),
      { statusCode: 403 }
    );
  }

  return { user, staffRole: rows[0]?.role || 'admin' };
}
