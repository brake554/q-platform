# Auth Summary

## What Was Built

Complete auth and verification system for Q users and business staff.

### Files Written
```
output/auth/src/
├── routes/auth.js                  — All auth endpoints
├── services/authService.js         — Registration, login, bcrypt
├── services/verificationService.js — Twilio OTP, AWS S3 ID/selfie upload
├── services/sessionService.js      — JWT issue/rotate/revoke, Redis-backed refresh tokens
├── middleware/requireVerified.js   — Blocks unverified users
└── utils/validators.js             — Fastify schemas + age gate + phone normalization
```

---

## JWT Claims

Every access token payload:
```json
{
  "user_id":     "uuid",
  "role":        "user | business_staff | business_admin | platform_admin",
  "is_verified": true,
  "score":       100,
  "iat":         1700000000,
  "exp":         1700000900
}
```

- **Access token:** 15-minute expiry, signed with `JWT_SECRET`
- **Refresh token:** 30-day expiry, signed with `JWT_REFRESH_SECRET`, stored in httpOnly cookie (path: `/api/auth/refresh`)
- **Refresh token revocation:** jti (UUID) tracked in Redis with 30d TTL; logout deletes all keys for user

For staff login (`POST /api/auth/venue/login`), `role` is `business_staff` or `business_admin` (or `platform_admin` if applicable). The `business_id` is returned in the response body (not in the JWT — routes use the DB for staff authorization).

---

## Registration Flow

```
Step 1: POST /api/auth/register
  → Validates email, phone, password, full_name, date_of_birth
  → Age gate: must be 18+
  → bcrypt password (12 rounds)
  → INSERT into users (is_verified = FALSE)
  → Initialize behavior_scores (score = 100)
  → Initialize reward_credits (balance = 0)
  → Send phone OTP via Twilio Verify
  → Returns: { userId, nextStep: 'verify-otp' }

Step 2: POST /api/auth/verify-otp
  → Submit phone + OTP code
  → Twilio Verify checks code
  → Returns: { userId, nextStep: 'upload-id' }
  → Note: is_verified is still FALSE — user still needs ID upload + admin approval

Step 3: POST /api/auth/upload-id   (requires access token from login)
  → Multipart upload: selfie (field: "selfie") + ID doc (field: "id_doc")
  → Both images uploaded to S3 private bucket with AES-256 SSE
  → S3 keys stored in users.selfie_key and users.id_doc_key
  → Keys are NEVER returned in any API response
  → Returns: { status: 'pending_review' }

Step 4: Platform admin reviews via /api/admin/users/pending
  → Admin can view images via pre-signed URLs (15-min expiry, internal only)
  → POST /api/admin/users/:id/approve → is_verified = TRUE
  → POST /api/admin/users/:id/reject  → clears selfie_key + id_doc_key (GDPR)
  → User receives socket event (future: push notification) on approval

Step 5: User logs in normally → receives JWT with is_verified: true
```

---

## Rate Limiting

| Endpoint | Limit |
|----------|-------|
| POST /api/auth/login | 5 attempts / 15 min |
| POST /api/auth/venue/login | 5 attempts / 15 min |
| POST /api/auth/register | 10 attempts / 15 min |
| POST /api/auth/verify-otp | 5 attempts / 15 min |

---

## Security Decisions

- **Timing-safe login:** bcrypt always runs even when user not found (prevents user enumeration)
- **No user enumeration:** Registration conflict returns specific field but login returns generic "Invalid credentials"
- **S3 keys never exposed:** `selfie_key` and `id_doc_key` are explicitly stripped before any API response in `GET /api/auth/me`
- **Refresh tokens:** httpOnly cookie, strict SameSite, secure in production; jti-based revocation via Redis
- **Password storage:** bcrypt with salt rounds = 12 (~300ms on modern hardware)
- **Age verification:** Server-side age gate at registration (18+)

---

## What the Frontend Needs to Implement

1. **Register screen:** 3-step form: email/phone/DOB/password → OTP entry → ID + selfie camera upload
2. **Verify screen:** Show "pending review" state after ID upload; poll `GET /api/auth/me` or listen for socket event
3. **Login screen:** email + password → store accessToken in memory (NOT localStorage) → auto-refresh via cookie
4. **Token refresh:** On 401 response, call `POST /api/auth/refresh` (cookie auto-sent) → retry original request
5. **Logout:** Call `POST /api/auth/logout` to revoke, clear local state
6. **Staff login:** Separate form with business_id selector → same token flow
