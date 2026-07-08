import { describe, it, expect } from 'vitest';
import { verifyHireBridgeSignature } from '../src/lib/hirebridge-signature';
import crypto from 'node:crypto';

function sign(token: string, payload: string): string {
  return crypto.createHmac('sha256', token).update(payload).digest('hex');
}

describe('verifyHireBridgeSignature', () => {
  const token = 'test-secret-token-32-bytes!';
  const payload = JSON.stringify({ request_id: 'abc', candidate_id: 'x', recruiter_identity: { name: 'R' } });

  it('returns true for a correct HMAC-SHA256 hex signature', () => {
    const sig = sign(token, payload);
    expect(verifyHireBridgeSignature(token, payload, sig)).toBe(true);
  });

  it('returns false for a wrong signature', () => {
    const wrong = sign('wrong-secret', payload);
    expect(verifyHireBridgeSignature(token, payload, wrong)).toBe(false);
  });

  it('returns false for a null signature', () => {
    expect(verifyHireBridgeSignature(token, payload, null)).toBe(false);
  });

  it('returns false for an empty signature', () => {
    expect(verifyHireBridgeSignature(token, payload, '')).toBe(false);
  });

  it('returns false for a signature of wrong byte length (must not throw)', () => {
    expect(verifyHireBridgeSignature(token, payload, 'abc')).toBe(false);
  });

  it('returns false for a non-hex signature (must not throw)', () => {
    expect(verifyHireBridgeSignature(token, payload, 'xyz!!!')).toBe(false);
  });
});
