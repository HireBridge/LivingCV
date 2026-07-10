import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type Db } from '@livingcv/db';
import { SETTING_KEYS, deriveCandidateId } from '@livingcv/shared';
import { decrypt } from '@livingcv/crypto';
import crypto from 'node:crypto';

// Shared, mutable admin flag — tests can flip it without re-mocking. vi.hoisted
// ensures this initialises before any module imports (vitest hoists vi.mock
// too, and combining that with vi.resetModules would otherwise re-import the
// real module on the second test).
const { adminState } = vi.hoisted(() => ({ adminState: { value: true } }));

vi.mock('@/lib/auth', () => ({
  getSession: async () => ({ admin: adminState.value }),
}));

let db: Db;
let dir: string;

function seedSetting(key: string, value: string) {
  db.prepare(
    'INSERT OR REPLACE INTO app_settings (key, value, encrypted, updated_at) VALUES (?, ?, 0, ?)',
  ).run(key, value, new Date().toISOString());
}

function plaintext(key: string): string | null {
  const row = db.prepare('SELECT value, encrypted FROM app_settings WHERE key = ?').get(key) as { value: string; encrypted: number } | undefined;
  if (!row) return null;
  if (row.encrypted !== 1) return row.value;
  return decrypt(row.value, process.env.PORTFOLIO_ENCRYPTION_KEY!);
}

beforeEach(async () => {
  adminState.value = true;
  dir = mkdtempSync(join(tmpdir(), 'hirebridge-connect-'));
  process.env.DATA_DIR = dir;
  process.env.PORTFOLIO_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  delete (globalThis as { __portfolioDb?: Db }).__portfolioDb;
  db = openDb(join(dir, 'test.db'));
  (globalThis as { __portfolioDb?: Db }).__portfolioDb = db;
  seedSetting(SETTING_KEYS.adminEmail, 'Admin@Example.com');
  seedSetting(SETTING_KEYS.hirebridgeApiUrl, 'https://hirebridge.test');
});

afterEach(() => {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  vi.unstubAllGlobals();
});

async function importConnect() {
  return await import('../src/app/api/hirebridge/connect/route');
}
async function importPoll() {
  return await import('../src/app/api/hirebridge/poll/route');
}

function makeRequest(url = 'http://localhost/api/hirebridge/connect', headers: Record<string, string> = {}) {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-host': 'example.test', 'x-forwarded-proto': 'https', ...headers },
  });
}

interface FakeFetchCall {
  url: string;
  init?: RequestInit;
}

function setupFetch(handlers: Array<(call: FakeFetchCall) => Response | Promise<Response>>) {
  const calls: FakeFetchCall[] = [];
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = typeof url === 'string' ? url : url instanceof URL ? url.toString() : (url as Request).url;
    calls.push({ url: u, init });
    const handler = handlers.shift();
    if (!handler) throw new Error(`unexpected fetch call: ${u}`);
    return await handler({ url: u, init });
  });
  vi.stubGlobal('fetch', fn);
  return calls;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/hirebridge/connect — device-auth flow', () => {
  it('derives client_id from the lowercase trimmed admin email and stores it in pending state', async () => {
    const { POST } = await importConnect();

    const calls = setupFetch([
      () => jsonResponse(200, {
        device_code: 'dev-123',
        user_code: 'ABCD-1234',
        verification_uri: 'https://hirebridge.test/activate',
        verification_uri_complete: 'https://hirebridge.test/activate?code=ABCD-1234',
        expires_in: 600,
        interval: 5,
      }),
      () => jsonResponse(200, { ok: true }),
    ]);

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.message).toContain('Admin@Example.com');
    expect(body.verification_uri_complete).toBe('https://hirebridge.test/activate?code=ABCD-1234');
    expect(body.interval).toBe(5);

    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toBe('https://hirebridge.test/auth/device');
    const devicePayload = JSON.parse(calls[0]!.init!.body as string);
    expect(devicePayload.node_type).toBe('livingcv');
    expect(devicePayload.endpoint_url).toBe('https://example.test');

    expect(calls[1]!.url).toBe('https://hirebridge.test/auth/request');
    expect((calls[1]!.init!.headers as Record<string, string>)['content-type']).toBe('application/x-www-form-urlencoded');
    expect(calls[1]!.init!.body).toBe('email=Admin%40Example.com&uc=ABCD-1234');

    const pendingRaw = plaintext(SETTING_KEYS.hirebridgePendingAuth);
    expect(pendingRaw).toBeTruthy();
    const pending = JSON.parse(pendingRaw!);
    expect(pending.client_id).toBe(deriveCandidateId('Admin@Example.com'));
    expect(pending.device_code).toBe('dev-123');
    expect(pending.user_code).toBe('ABCD-1234');
    expect(pending.api_url).toBe('https://hirebridge.test');
  });

  it('refuses when admin email is missing', async () => {
    db.prepare('DELETE FROM app_settings WHERE key = ?').run(SETTING_KEYS.adminEmail);
    const { POST } = await importConnect();
    setupFetch([]);
    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/admin email/i);
  });

  it('refuses when hirebridge.api_url is missing', async () => {
    db.prepare('DELETE FROM app_settings WHERE key = ?').run(SETTING_KEYS.hirebridgeApiUrl);
    const { POST } = await importConnect();
    setupFetch([]);
    const res = await POST(makeRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/HireBridge API URL/i);
  });

  it('surfaces a 502 if HireBridge /auth/device is unreachable', async () => {
    const { POST } = await importConnect();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));

    const res = await POST(makeRequest());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/Could not reach HireBridge/);
  });

  it('surfaces a 502 if HireBridge /auth/device returns an invalid payload', async () => {
    const { POST } = await importConnect();
    setupFetch([() => jsonResponse(200, { device_code: undefined, user_code: undefined })]);
    const res = await POST(makeRequest());
    expect(res.status).toBe(502);
  });

  it('surfaces a 502 if HireBridge /auth/request fails', async () => {
    const { POST } = await importConnect();
    setupFetch([
      () => jsonResponse(200, { device_code: 'd', user_code: 'u', interval: 5, expires_in: 600 }),
      () => jsonResponse(500, { error: 'mail down' }),
    ]);
    const res = await POST(makeRequest());
    expect(res.status).toBe(502);
  });

  it('returns 401 when there is no admin session', async () => {
    adminState.value = false;
    const { POST } = await importConnect();
    setupFetch([]);
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
  });
});

describe('POST /api/hirebridge/poll — RFC 8628 polling', () => {
  function seedPending(overrides: Partial<{
    device_code: string; interval: number; expires_at: number;
    api_url: string; admin_email: string; client_id: string;
  }> = {}) {
    const pending = {
      device_code: 'dev-abc',
      user_code: 'U-1',
      interval: 5,
      expires_at: Date.now() + 60_000,
      api_url: 'https://hirebridge.test',
      admin_email: 'admin@example.com',
      client_id: deriveCandidateId('admin@example.com'),
      ...overrides,
    };
    db.prepare(
      'INSERT OR REPLACE INTO app_settings (key, value, encrypted, updated_at) VALUES (?, ?, 0, ?)',
    ).run(SETTING_KEYS.hirebridgePendingAuth, JSON.stringify(pending), new Date().toISOString());
    return pending;
  }

  it('returns { pending: true } when HireBridge reports authorization_pending (RFC 8628 400)', async () => {
    seedPending();
    const { POST } = await importPoll();
    const calls = setupFetch([
      () => jsonResponse(400, { error: 'authorization_pending' }),
    ]);

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ pending: true, interval: 5 });

    expect(calls).toHaveLength(1);
    const init = calls[0]!.init!;
    const headers = init.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/x-www-form-urlencoded');
    expect(init.body).toBe('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code&device_code=dev-abc');
  });

  it('honors slow_down by extending the stored interval by 5s', async () => {
    seedPending({ interval: 5 });
    const { POST } = await importPoll();
    setupFetch([() => jsonResponse(400, { error: 'slow_down' })]);

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ pending: true, interval: 10 });

    const stored = plaintext(SETTING_KEYS.hirebridgePendingAuth);
    const pending = JSON.parse(stored!);
    expect(pending.interval).toBe(10);
  });

  it('clears pending state and returns 410 on expired_token', async () => {
    seedPending();
    const { POST } = await importPoll();
    setupFetch([() => jsonResponse(400, { error: 'expired_token' })]);

    const res = await POST();
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toMatch(/expired_token/);

    expect(plaintext(SETTING_KEYS.hirebridgePendingAuth)).toBeNull();
  });

  it('clears pending state and returns 410 on access_denied', async () => {
    seedPending();
    const { POST } = await importPoll();
    setupFetch([() => jsonResponse(400, { error: 'access_denied' })]);

    const res = await POST();
    expect(res.status).toBe(410);
  });

  it('clears pending state when the stored expires_at has already passed', async () => {
    seedPending({ expires_at: Date.now() - 1000 });
    const { POST } = await importPoll();
    setupFetch([]);
    const res = await POST();
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toMatch(/expired/);
  });

  it('persists contract keys on success: access_token, token (= intro_secret), node_id, client_id, connected', async () => {
    seedPending();
    const { POST } = await importPoll();
    setupFetch([
      () => jsonResponse(200, {
        access_token: 'hb-access-xyz',
        node_id: 'node-42',
        token_type: 'Bearer',
        scope: 'node:push',
        intro_secret: 'shared-hmac-secret',
      }),
    ]);

    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ connected: true, node_id: 'node-42', client_id: deriveCandidateId('admin@example.com') });

    expect(plaintext(SETTING_KEYS.hirebridgeAccessToken)).toBe('hb-access-xyz');
    expect(plaintext(SETTING_KEYS.hirebridgeToken)).toBe('shared-hmac-secret');
    expect(plaintext(SETTING_KEYS.hirebridgeNodeId)).toBe('node-42');
    expect(plaintext(SETTING_KEYS.hirebridgeClientId)).toBe(deriveCandidateId('admin@example.com'));
    expect(plaintext(SETTING_KEYS.hirebridgeConnected)).toBe('1');

    expect(plaintext(SETTING_KEYS.hirebridgePendingAuth)).toBeNull();
  });

  it('returns 502 if the successful token response is missing required fields', async () => {
    seedPending();
    const { POST } = await importPoll();
    setupFetch([() => jsonResponse(200, { access_token: 'a' })]);

    const res = await POST();
    expect(res.status).toBe(502);
  });

  it('returns 502 when HireBridge is unreachable', async () => {
    seedPending();
    const { POST } = await importPoll();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNRESET'); }));

    const res = await POST();
    expect(res.status).toBe(502);
  });

  it('returns 400 when there is no pending connection', async () => {
    const { POST } = await importPoll();
    setupFetch([]);
    const res = await POST();
    expect(res.status).toBe(400);
  });

  it('returns 401 when there is no admin session', async () => {
    adminState.value = false;
    seedPending();
    const { POST } = await importPoll();
    setupFetch([]);
    const res = await POST();
    expect(res.status).toBe(401);
  });
});