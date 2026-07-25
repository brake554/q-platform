/**
 * Input validators for auth endpoints.
 * Used as Fastify JSON Schema for request body validation.
 */

export const registerSchema = {
  body: {
    type: 'object',
    required: ['email', 'phone', 'password', 'full_name', 'date_of_birth'],
    properties: {
      email:          { type: 'string', format: 'email', maxLength: 255 },
      phone:          { type: 'string', pattern: '^\\+?[1-9]\\d{7,14}$' }, // E.164 format
      password:       { type: 'string', minLength: 8, maxLength: 128 },
      full_name:      { type: 'string', minLength: 2, maxLength: 100 },
      date_of_birth:  { type: 'string', format: 'date' },  // YYYY-MM-DD
    },
    additionalProperties: false,
  },
};

export const loginSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email:    { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 1, maxLength: 128 },
    },
    additionalProperties: false,
  },
};

export const otpVerifySchema = {
  body: {
    type: 'object',
    required: ['phone', 'code'],
    properties: {
      phone: { type: 'string' },
      code:  { type: 'string', minLength: 4, maxLength: 10 },
    },
    additionalProperties: false,
  },
};

export const staffLoginSchema = {
  body: {
    type: 'object',
    required: ['email', 'password', 'business_id'],
    properties: {
      email:       { type: 'string', format: 'email' },
      password:    { type: 'string', minLength: 1 },
      business_id: { type: 'string', format: 'uuid' },
    },
    additionalProperties: false,
  },
};

/**
 * Validate that a user is of legal age (18+).
 * @param {string} dob - YYYY-MM-DD
 * @returns {boolean}
 */
export function isOfLegalAge(dob) {
  const birthDate = new Date(dob);
  const today = new Date();
  const age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    return age - 1 >= 18;
  }
  return age >= 18;
}

/**
 * Normalize phone number to E.164 format (basic normalization).
 * @param {string} phone
 * @returns {string}
 */
export function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;  // Assume North American
  if (!phone.startsWith('+')) return `+${digits}`;
  return phone;
}
