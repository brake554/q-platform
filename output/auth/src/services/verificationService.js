/**
 * Verification Service
 *
 * Handles:
 * - Phone OTP via Twilio Verify
 * - ID + selfie upload to S3 (private bucket, keys never exposed in API)
 */

import twilio from 'twilio';
import AWS from 'aws-sdk';
import { randomUUID } from 'crypto';
import 'dotenv/config';

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

// ─── OTP ─────────────────────────────────────────────────────────────────────

/**
 * Send OTP to a phone number via Twilio Verify.
 * @param {string} phone - E.164 format
 */
export async function sendOTP(phone) {
  const verification = await twilioClient.verify.v2
    .services(process.env.TWILIO_VERIFY_SERVICE_SID)
    .verifications.create({ to: phone, channel: 'sms' });

  return { status: verification.status };
}

/**
 * Check an OTP code.
 * @param {string} phone
 * @param {string} code
 * @returns {{ valid: boolean }}
 */
export async function checkOTP(phone, code) {
  try {
    const check = await twilioClient.verify.v2
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks.create({ to: phone, code });

    return { valid: check.status === 'approved' };
  } catch (err) {
    // Twilio throws when code is wrong or expired
    return { valid: false };
  }
}

// ─── S3 uploads ──────────────────────────────────────────────────────────────

/**
 * Upload a verification image (selfie or ID doc) to S3.
 * Returns the S3 object key — NOT the URL. Keys are never returned in API responses.
 *
 * @param {Buffer} buffer - File buffer
 * @param {string} mimeType - e.g. 'image/jpeg'
 * @param {'selfie'|'id_doc'} type
 * @param {string} userId
 * @returns {string} S3 key
 */
export async function uploadVerificationImage(buffer, mimeType, type, userId) {
  const ext = mimeType.split('/')[1] || 'jpg';
  const key = `verification/${userId}/${type}/${randomUUID()}.${ext}`;

  await s3.putObject({
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: mimeType,
    // Private ACL — no public access
    ACL: 'private',
    // Server-side encryption
    ServerSideEncryption: 'AES256',
  }).promise();

  return key;
}

/**
 * Generate a temporary pre-signed URL for internal admin review (expires 15 min).
 * Only used by platform admin review tooling — never returned to end users.
 * @param {string} key - S3 object key
 * @returns {string} Pre-signed URL
 */
export async function getAdminReviewUrl(key) {
  return s3.getSignedUrlPromise('getObject', {
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
    Expires: 900, // 15 minutes
  });
}

/**
 * Delete verification images when a user is rejected (GDPR / data minimization).
 * @param {string[]} keys
 */
export async function deleteVerificationImages(keys) {
  const objects = keys.filter(Boolean).map((Key) => ({ Key }));
  if (!objects.length) return;

  await s3.deleteObjects({
    Bucket: process.env.AWS_S3_BUCKET,
    Delete: { Objects: objects },
  }).promise();
}
