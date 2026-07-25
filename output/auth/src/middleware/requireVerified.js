/**
 * requireVerified middleware
 *
 * Ensures the JWT user has is_verified = true.
 * Users in pending state (OTP done, awaiting admin approval) get a specific error.
 */

export async function requireVerified(request, reply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: 'Unauthorized' });
  }

  if (!request.user?.is_verified) {
    return reply.code(403).send({
      error: 'Verification required',
      message: 'Your Q account is pending verification. You will be notified when approved.',
      code: 'PENDING_VERIFICATION',
    });
  }
}
