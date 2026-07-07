// Phase 2 acceptance smoke (operational, NOT part of CI).
//
// Run from the repo root with jobops already listening:
//
//   JOBOPS_PORT=7891 JOBOPS_AUTH_TOKEN=smoke \
//     node open_source/jobops/dist/cli.js start &
//   npx tsx scripts/smoke-phase2.ts
//
// Drives the orchestrator's gate IN-PROCESS (no Express listener needed) and
// asserts portfolio.db has the verified lead row. Then probes the live jobops
// /mcp/public endpoint.
//
// The plan's required vitest tests are:
//   - apps/orchestrator/tests/prompt-injection.test.ts (MCP-only-lists-2-public-tools)
//   - jobops/tests/public-mcp-surface.test.mjs (PUBLIC_TOOLS + /mcp/public)
// This script is operational evidence — it is NOT the test plan.

import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';

const JOBOPS_BASE = process.env.JOBOPS_BASE_URL || 'http://127.0.0.1:7891';

// Make an email-at-sign at runtime — avoids any source-text processor (markdown
// editors, email-protectors, etc.) that might obliterate the literal.
const AT_SIGN = String.fromCharCode(64);

async function main() {
  // Probe jobops first.
  const healthRes = await fetch(`${JOBOPS_BASE}/healthz`);
  if (!healthRes.ok) {
    console.error(`[smoke] jobops not reachable at ${JOBOPS_BASE}. Start it first.`);
    process.exit(1);
  }
  console.log(`[smoke] jobops is up at ${JOBOPS_BASE}`);

  // Bring up an orchestrator-shaped DB in a tempdir.
  const dataDir = mkdtempSync(join(tmpdir(), 'p2-smoke-orch-'));
  process.env.DATA_DIR = dataDir;
  process.env.SESSION_SECRET = 'phase2-smoke-secret-value-long-enough-32';
  process.env.PORTFOLIO_ENCRYPTION_KEY = 's38vFTFOjEXwZcfk7t08LkjOcwSpqEQz5f80dvOX2CU=';
  process.env.IP_HASH_SALT = 'phase2-smoke-salt';
  process.env.JOBOPS_BASE_URL = JOBOPS_BASE;

  // Lazy-import the orchestrator internals so env is set first.
  const { getDb } = await import('../apps/orchestrator/src/db.js');
  const { createRecruiterSession } = await import('../apps/orchestrator/src/db.js');
  const { submitWorkEmailImpl, hashIp } = await import('../apps/orchestrator/src/gate.js');
  const { randomUUID } = await import('node:crypto');

  const db = getDb();
  const sessionId = randomUUID();
  createRecruiterSession(db, { id: sessionId, channel: 'text', ip_hash: hashIp('127.0.0.1'), user_agent: 'smoke' });
  console.log(`[smoke] session: ${sessionId}`);

  // Reject a free-provider email.
  const rej = submitWorkEmailImpl(db, sessionId, { email: 'someone' + AT_SIGN + 'gmail.com' });
  if (rej.ok) throw new Error('expected gmail.com to be rejected');
  console.log(`[smoke] PASS: gmail.com rejected (${rej.message})`);

  // Accept a corp email.
  const corp = 'recruiter' + AT_SIGN + 'acme-corp.com';
  const acc = submitWorkEmailImpl(db, sessionId, { email: corp });
  if (!acc.ok) throw new Error(`expected acme-corp.com to be accepted: ${acc.message}`);
  console.log(`[smoke] PASS: accepted ${corp}`);

  // Verify the lead row in portfolio.db.
  const read = new Database(join(dataDir, 'portfolio.db'), { readonly: true });
  const row = read
    .prepare('SELECT work_email, email_domain, email_verified FROM recruiter_sessions WHERE id = ?')
    .get(sessionId) as { work_email: string; email_domain: string; email_verified: number };
  read.close();
  if (row.work_email !== corp) throw new Error(`lead row work_email mismatch: ${row.work_email}`);
  if (row.email_domain !== 'acme-corp.com') throw new Error(`domain mismatch: ${row.email_domain}`);
  if (row.email_verified !== 1) throw new Error(`email_verified should be 1`);
  console.log(`[smoke] PASS: recruiter_sessions.email_verified=1`);

  // Live /mcp/public on jobops: the public surface must list exactly the
  // two curated tools.
  const pubBody = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
  const pubRes = await fetch(`${JOBOPS_BASE}/mcp/public`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: pubBody,
  });
  console.log(`[smoke] fetch url=${JOBOPS_BASE}/mcp/public`);
  if (pubRes.status !== 200) {
    const text = await pubRes.text();
    throw new Error(`/mcp/public status ${pubRes.status}: ${text.slice(0, 200)}`);
  }
  const pub = (await pubRes.json()) as { result?: { tools?: Array<{ name: string }> } };
  const names = (pub.result?.tools ?? []).map((t) => t.name).sort();
  if (names.join(',') !== 'get_career_packet,get_story_bank_public') {
    throw new Error(`/mcp/public listed: ${names.join(',')}`);
  }
  console.log(`[smoke] PASS: /mcp/public lists exactly ${names.join(', ')}`);

  // Live /mcp on jobops is gated (token required).
  const gated = await fetch(`${JOBOPS_BASE}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: pubBody,
  });
  if (gated.status !== 401) throw new Error(`/mcp without token should 401, got ${gated.status}`);
  console.log(`[smoke] PASS: /mcp without token returns 401`);

  console.log('[smoke] ALL PHASE 2 ACCEPTANCE ASSERTIONS PASS');
  rmSync(dataDir, { recursive: true, force: true });
  // Force-exit so lingering listeners (webhook fetch timeouts, etc.) don't
  // hold the smoke process indefinitely.
  process.exit(0);
}

main().catch((e) => {
  console.error(`[smoke] FAIL: ${e.message ?? e}`);
  process.exit(1);
});
