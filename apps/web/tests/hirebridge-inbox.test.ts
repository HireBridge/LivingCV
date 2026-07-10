import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type Db } from '@livingcv/db';
import { SETTING_KEYS, deriveCandidateId } from '@livingcv/shared';
import { encrypt } from '@livingcv/crypto';
import crypto from 'node:crypto';

// Stub the jobops MCP client so the route's best-effort add_contacts push
// doesn't try to reach a real jobops. We assert it was called with the
// recruiter identity parsed from the signed body.
const mcpCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
vi.mock('@/lib/mcp', () => ({
  getMcpClient: async () => ({
    client: {
      callTool: async ({ name, arguments: args }: { name: string; arguments: Record<string, unknown> }) => {
        mcpCalls.push({ name, args });
        return { content: [], structuredContent: { ok: true } };
      },
    },
    close: async () => undefined,
  }),
}));

let db: Db;
let dir: string;

function seedEncrypted(key: string, value: string) {
  const cipher = encrypt(value, process.env.PORTFOLIO_ENCRYPTION_KEY!);
  db.prepare(
    'INSERT OR REPLACE INTO app_settings (key, value, encrypted, updated_at) VALUES (?, ?, 1, ?)',
  ).run(key, cipher, new Date().toISOString());
}
function seedPlain(key: string, value: string) {
  db.prepare(
    'INSERT OR REPLACE INTO app_settings (key, value, encrypted, updated_at) VALUES (?, ?, 0, ?)',
  ).run(key, value, new Date().toISOString());
}

beforeEach(() => {
  mcpCalls.length = 0;
  dir = mkdtempSync(join(tmpdir(), 'hirebridge-inbox-'));
  process.env.DATA_DIR = dir;
  process.env.PORTFOLIO_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  delete (globalThis as { __portfolioDb?: Db }).__portfolioDb;
  db = openDb(join(dir, 'test.db'));
  (globalThis as { __portfolioDb?: Db }).__portfolioDb = db;
  // Pretend the device-auth flow already completed.
  seedPlain(SETTING_KEYS.hirebridgeConnected, '1');
  seedEncrypted(SETTING_KEYS.hirebridgeToken, 'shared-intro-secret-xyz');
  seedPlain(SETTING_KEYS.hirebridgeClientId, deriveCandidateId('admin@example.com'));
});

afterEach(() => {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
});

function sign(token: string, body: string): string {
  return crypto.createHmac('sha256', token).update(body).digest('hex');
}

function makeInbox(body: string, signature: string | null) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (signature !== null) headers['X-HireBridge-Signature'] = signature;
  return new Request('http://localhost/api/inbox', { method: 'POST', headers, body });
}

async function importInbox() {
  return await import('../src/app/api/inbox/route');
}

describe('POST /api/inbox — HireBridge introduction delivery', () => {
  it('accepts a correctly signed payload and pushes the recruiter via add_contacts', async () => {
    const { POST } = await importInbox();
    const body = JSON.stringify({
      request_id: 'req-1',
      candidate_id: deriveCandidateId('admin@example.com'),
      recruiter_identity: { name: 'Pat Recruiter', email: 'pat@acme.com', company: 'Acme' },
      ts: '2026-07-10T00:00:00Z',
    });
    const res = await POST(makeInbox(body, sign('shared-intro-secret-xyz', body)));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, request_id: 'req-1' });

    expect(mcpCalls).toHaveLength(1);
    expect(mcpCalls[0]!.name).toBe('add_contacts');
    const contacts = (mcpCalls[0]!.args.contacts as Array<{ full_name: string; email: string; notes: string }>);
    expect(contacts[0]!.full_name).toBe('Pat Recruiter');
    expect(contacts[0]!.email).toBe('pat@acme.com');
    expect(contacts[0]!.notes).toContain('req-1');
  });

  it('rejects a tampered body (signature mismatch → 401)', async () => {
    const { POST } = await importInbox();
    const body = JSON.stringify({
      request_id: 'req-1',
      candidate_id: deriveCandidateId('admin@example.com'),
      recruiter_identity: { name: 'Pat Recruiter', email: 'pat@acme.com' },
    });
    const tampered = body.replace('Pat Recruiter', 'Attacker');
    const res = await POST(makeInbox(tampered, sign('shared-intro-secret-xyz', body)));

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/Invalid signature/i);
    expect(mcpCalls).toHaveLength(0);
  });

  it('rejects a payload whose candidate_id does not match this portfolio (403)', async () => {
    const { POST } = await importInbox();
    const body = JSON.stringify({
      request_id: 'req-1',
      candidate_id: 'someone-elses-candidate-id',
      recruiter_identity: { name: 'Pat Recruiter', email: 'pat@acme.com' },
    });
    const res = await POST(makeInbox(body, sign('shared-intro-secret-xyz', body)));

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/candidate_id mismatch/i);
    expect(mcpCalls).toHaveLength(0);
  });

  it('rejects a missing signature header', async () => {
    const { POST } = await importInbox();
    const body = JSON.stringify({
      request_id: 'req-1',
      candidate_id: deriveCandidateId('admin@example.com'),
      recruiter_identity: { name: 'Pat', email: 'pat@acme.com' },
    });
    const res = await POST(makeInbox(body, null));
    expect(res.status).toBe(401);
    expect(mcpCalls).toHaveLength(0);
  });

  it('rejects when HireBridge is not connected', async () => {
    db.prepare('UPDATE app_settings SET value = ? WHERE key = ?').run('0', SETTING_KEYS.hirebridgeConnected);
    const { POST } = await importInbox();
    const body = JSON.stringify({
      request_id: 'req-1',
      candidate_id: deriveCandidateId('admin@example.com'),
      recruiter_identity: { name: 'Pat', email: 'pat@acme.com' },
    });
    const res = await POST(makeInbox(body, sign('shared-intro-secret-xyz', body)));
    expect(res.status).toBe(403);
  });

  it('returns 200 even if the best-effort jobops push fails', async () => {
    // Re-mock getMcpClient to throw — the inbox must still ack so HireBridge
    // doesn't retry forever for a local-sync outage.
    vi.resetModules();
    vi.doMock('@/lib/mcp', () => ({
      getMcpClient: async () => ({
        client: {
          callTool: async () => { throw new Error('jobops down'); },
        },
        close: async () => undefined,
      }),
    }));
    const { POST } = await importInbox();
    const body = JSON.stringify({
      request_id: 'req-1',
      candidate_id: deriveCandidateId('admin@example.com'),
      recruiter_identity: { name: 'Pat', email: 'pat@acme.com' },
    });
    const res = await POST(makeInbox(body, sign('shared-intro-secret-xyz', body)));
    expect(res.status).toBe(200);
    vi.doUnmock('@/lib/mcp');
  });

  it('rejects a payload missing required fields (400)', async () => {
    const { POST } = await importInbox();
    const body = JSON.stringify({ request_id: 'req-1' });
    const res = await POST(makeInbox(body, sign('shared-intro-secret-xyz', body)));
    expect(res.status).toBe(400);
  });
});