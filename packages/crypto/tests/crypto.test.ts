import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, generateEncryptionKey, maskSecret } from '../src/index.js';

describe('crypto', () => {
  const key = generateEncryptionKey();

  it('round-trips plaintext', () => {
    const ct = encrypt('hello world', key);
    expect(ct.startsWith('v1:')).toBe(true);
    expect(decrypt(ct, key)).toBe('hello world');
  });

  it('produces a unique ciphertext for the same input (random IV)', () => {
    const a = encrypt('same', key);
    const b = encrypt('same', key);
    expect(a).not.toBe(b);
    expect(decrypt(a, key)).toBe('same');
    expect(decrypt(b, key)).toBe('same');
  });

  it('fails to decrypt with the wrong key (auth tag mismatch)', () => {
    const ct = encrypt('secret', key);
    const otherKey = generateEncryptionKey();
    expect(() => decrypt(ct, otherKey)).toThrow();
  });

  it('rejects a malformed key', () => {
    expect(() => encrypt('x', 'not-32-bytes')).toThrow();
    expect(() => decrypt('v1:YQ==:YQ==:YQ==', 'not-32-bytes')).toThrow();
  });

  it('rejects a tampered ciphertext (GCM detects modification)', () => {
    const ct = encrypt('secret', key);
    // Flip the first character of the IV segment (the part right after "v1:").
    // A wrong IV changes J0, so the recomputed auth tag no longer matches and
    // GCM rejects the ciphertext. We flip to a *different* base64-safe char so
    // the decoded IV actually changes.
    const ivStart = ct.indexOf(':') + 1;
    const orig = ct[ivStart];
    const flip = orig === 'A' ? 'B' : 'A';
    const tampered = ct.slice(0, ivStart) + flip + ct.slice(ivStart + 1);
    expect(() => decrypt(tampered, key)).toThrow();
    // A structurally malformed ciphertext is also rejected (IV/tag length).
    expect(() => decrypt('v1:bad:bad:bad', key)).toThrow();
  });

  it('rejects a ciphertext with a wrong version prefix', () => {
    expect(() => decrypt('v2:YQ==:YQ==:YQ==', key)).toThrow();
  });

  it('masks secrets to •••• + last4 and never returns the full value', () => {
    expect(maskSecret('sk-abc123456789')).toBe('••••6789');
    expect(maskSecret('')).toBe('');
    expect(maskSecret('ab')).toBe('••••ab');
  });

  it('generateEncryptionKey produces a 32-byte base64 key', () => {
    const k = generateEncryptionKey();
    expect(Buffer.from(k, 'base64').length).toBe(32);
  });
});
