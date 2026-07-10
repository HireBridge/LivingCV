import crypto from 'node:crypto';

// Canonical Federation Contract v1: candidate_id (aka this repo's
// hirebridge.client_id) is the first 32 hex chars of
// sha256(lowercase(trim(admin_email))). jobops derives the same value from its
// HireBridge email — the operator must use the same email in both systems for
// introductions to land in /api/inbox.
export function deriveCandidateId(adminEmail: string): string {
  const normalized = adminEmail.trim().toLowerCase();
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 32);
}