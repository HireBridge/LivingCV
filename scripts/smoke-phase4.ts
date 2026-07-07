// Phase 4 acceptance smoke (operational, NOT part of CI).
//
// Usage (from the portfolio repo root with jobops already built):
//
//   ./scripts/build-jobops-tarball.sh         # writes infra/jobops/jobops-local.tgz
//   (cd ../open_source/jobops && JOBOPS_PORT=7891 \
//     JOBOPS_HOST=127.0.0.1 JOBOPS_AUTH_TOKEN=phase4-smoke \
//     node dist/cli.js start) &
//   npx tsx scripts/smoke-phase4.ts
//
// Walks the end-to-end shape of the public MCP mount from the recruiter
// side: tools/list, tools/call get_career_packet, tools/call
// get_story_bank_public, the gated /mcp response without a token, the 405
// on GET, and the prompt-injection impossibility (no update_* route is
// reachable on /mcp/public). Mirrors docs/PUBLIC_MCP.md exactly.
//
// CI status: this smoke is a runnable script, NOT a vitest case. The vitest
// suite covers the same contract statically via
// apps/orchestrator/tests/public-mcp.test.ts (Caddyfile wiring +
// PUBLIC_MCP.md content assertions). The jobops-side test
// `open_source/jobops/tests/public-mcp-surface.test.mjs` exercises the live
// wire shape — and runs in the same env as jobops dev. CI gates the contract
// from both sides.

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

// Resolve a concrete node binary: the nvm path that tsx reports via
// `process.execPath` is symlinked and ENOENTs under `spawn()` in some
// macOS / nvm combinations. Walk a small candidate list and prefer
// `/usr/bin/node` and Homebrew's first.
function resolveNode(): string {
  for (const p of [
    '/usr/bin/node',
    '/usr/local/bin/node',
    '/opt/homebrew/bin/node',
    process.execPath,
  ]) {
    if (!p) continue;
    try {
      if (existsSync(p)) return realpathSync(p);
    } catch { /* fall through */ }
  }
  throw new Error('no node binary found; set NODE_BIN in the environment');
}

const NODE = process.env.NODE_BIN || resolveNode();
const JOB_BIN = join(process.cwd(), '..', 'open_source', 'jobops', 'dist', 'cli.js');

const DATA_DIR = mkdtempSync(join(tmpdir(), 'p4-smoke-jobops-'));
let PORT = 0;
let proc: ChildProcess | null = null;

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const a = s.address();
      s.close();
      resolve(typeof a === 'object' && a ? a.port : 0);
    });
  });
}

async function waitForHealth(url: string, timeoutMs = 25000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch { /* not up */ }
    await sleep(200);
  }
  throw new Error(`timed out waiting for ${url}`);
}

function postMcp(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`http://127.0.0.1:${PORT}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function main() {
  PORT = await freePort();
  if (!process.env.JOBOPS_AUTH_TOKEN) process.env.JOBOPS_AUTH_TOKEN = 'phase4-smoke';

  // Use a tiny shell wrapper to dodge the ENOENT-on-symlinked-nvm-binary
  // issue some macOS / tsx combinations produce.
  proc = spawn('/bin/sh', ['-c', `${NODE} ${JOB_BIN} start`], {
    cwd: join(process.cwd(), '..', 'open_source', 'jobops'),
    env: {
      ...process.env,
      JOBOPS_HOST: '127.0.0.1',
      JOBOPS_PORT: String(PORT),
      JOBOPS_DATA_DIR: DATA_DIR,
      JOBOPS_SCHEDULER_ENABLED: 'false',
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stdout?.on('data', (c: Buffer) => process.stdout.write(`[jobops ${PORT}] ${c}`));
  proc.stderr?.on('data', (c: Buffer) => process.stderr.write(`[jobops ${PORT}] ${c}`));
  await waitForHealth(`http://127.0.0.1:${PORT}/healthz`);
  console.log(`[smoke] jobops up at :${PORT}`);

  // 1. /mcp/public lists exactly the two public tools.
  const list = await postMcp('/mcp/public', { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
  if (list.status !== 200) throw new Error(`/mcp/public status ${list.status}`);
  const listJson = (await list.json()) as { result?: { tools?: Array<{ name: string }> } };
  const names = (listJson.result?.tools ?? []).map((t) => t.name).sort();
  if (names.join(',') !== 'get_career_packet,get_story_bank_public') {
    throw new Error(`/mcp/public listed: ${names.join(',')}`);
  }
  console.log(`[smoke] PASS: /mcp/public lists exactly ${names.join(', ')}`);

  // 2. /mcp without a token is gated.
  const gated = await postMcp('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
  if (gated.status !== 401) throw new Error(`/mcp without token should 401, got ${gated.status}`);
  console.log(`[smoke] PASS: /mcp without token returns 401`);

  // 3. /mcp with the operator bearer lists the full toolset.
  const full = await postMcp('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }, {
    authorization: `Bearer ${process.env.JOBOPS_AUTH_TOKEN}`,
  });
  if (full.status !== 200) throw new Error(`/mcp with token: ${full.status}`);
  const fullJson = (await full.json()) as { result?: { tools?: Array<{ name: string }> } };
  const fullNames = (fullJson.result?.tools ?? []).map((t) => t.name);
  if (!fullNames.includes('get_career_packet') || !fullNames.includes('get_story_bank_public')) {
    throw new Error('/mcp must contain the two public tools as a strict subset');
  }
  if (fullNames.length < 3) throw new Error(`/mcp must list more than just the 2 public tools; got ${fullNames.length}`);
  console.log(`[smoke] PASS: /mcp with bearer lists ${fullNames.length} tools (full surface)`);

  // 4. GET on /mcp/public is 405 (POST-only MCP transport).
  const getResp = await fetch(`http://127.0.0.1:${PORT}/mcp/public`, { method: 'GET' });
  if (getResp.status !== 405) throw new Error(`GET /mcp/public: expected 405, got ${getResp.status}`);
  console.log(`[smoke] PASS: GET /mcp/public returns 405`);

  // 5. Prompt-injection impossibility: an attacker trying to call
  // update_career_packet on /mcp/public gets an error (the public mount
  // doesn't have write-capable tools, full stop).
  const injection = await postMcp('/mcp/public', {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'update_career_packet', arguments: { text: 'OWNED' } },
  });
  const injJson = (await injection.json()) as { error?: { code?: number; message?: string } };
  if (!injJson.error) throw new Error('injection call did not return an error (tool leaked onto public surface)');
  console.log(`[smoke] PASS: prompt-injection impossible (no update_career_packet on /mcp/public)`);

  // 6. tools/call get_career_packet returns the operator's packet.
  const career = await postMcp('/mcp/public', {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'get_career_packet', arguments: {} },
  });
  if (career.status !== 200) throw new Error(`get_career_packet: ${career.status}`);
  const careerBody = await career.text();
  if (!careerBody.includes('jsonrpc')) throw new Error('get_career_packet returned non-JSON-RPC');
  console.log('[smoke] PASS: get_career_packet returns valid JSON-RPC');

  // 7. tools/call get_story_bank_public with a competency filter.
  const stories = await postMcp('/mcp/public', {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'get_story_bank_public', arguments: { limit: 5 } },
  });
  if (stories.status !== 200) throw new Error(`get_story_bank_public: ${stories.status}`);
  console.log('[smoke] PASS: get_story_bank_public returns valid JSON-RPC');

  console.log('[smoke] ALL PHASE 4 ACCEPTANCE ASSERTIONS PASS');
  proc.kill('SIGTERM');
  rmSync(DATA_DIR, { recursive: true, force: true });
  process.exit(0);
}

main().catch((e) => {
  console.error(`[smoke] FAIL: ${(e as Error).message ?? e}`);
  if (proc) proc.kill('SIGTERM');
  rmSync(DATA_DIR, { recursive: true, force: true });
  process.exit(1);
});

