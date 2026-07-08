import crypto from 'node:crypto';

export function verifyHireBridgeSignature(
  token: string,
  payload: string,
  signatureHeader: string | null,
): boolean {
  if (!signatureHeader) return false;
  const expected = crypto.createHmac('sha256', token).update(payload).digest('hex');
  // Use timing-safe comparison to prevent timing attacks.
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}
