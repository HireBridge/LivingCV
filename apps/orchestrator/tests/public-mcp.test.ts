// Phase 4 acceptance — Caddy routes /mcp* to jobops.
//
// The full end-to-end check (jobops live + Caddy proxy) lives in
// `scripts/smoke-phase4.ts`. That script boots a real jobops on an
// ephemeral port and walks the public-mount tools/list exchange. The
// vitest test here is the cheaper, CI-friendly layer: it asserts the
// proxy is wired at all. If the Caddyfile ever drops the /mcp* route
// (or accidentally narrows it), the test fails and the operator catches
// the regression before they ship.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CADDYFILE = join(process.cwd(), 'infra', 'Caddyfile');
const CADDY = readFileSync(CADDYFILE, 'utf8');

describe('Caddy routes the public MCP mount to jobops', () => {
  it('proxies /mcp* to the jobops container', () => {
    // The Caddy entry for the public MCP mount must exist. Match the
    // Caddyfile handle line and the upstream line together.
    expect(CADDY).toMatch(/handle\s+\/mcp\*\s*\{/);
    expect(CADDY).toMatch(/reverse_proxy\s+jobops:7891/);
  });

  it('does not gate /mcp behind a token at the Caddy layer', () => {
    // The public surface is intentionally open. Caddy must not require a
    // bearer for the /mcp* handle. jobops itself gates /mcp (full toolset)
    // and leaves /mcp/public open; Caddy's only job is the pass-through.
    const handleMatch = CADDY.match(/handle\s+\/mcp\*\s*\{([^}]*)\}/);
    expect(handleMatch, '/mcp* handle must exist').not.toBeNull();
    const body = handleMatch![1];
    expect(body).not.toMatch(/basicauth|require_token|@authenticated/i);
  });

  it('documents the canonical public URL in PUBLIC_MCP.md', () => {
    const doc = readFileSync(join(process.cwd(), 'docs', 'PUBLIC_MCP.md'), 'utf8');
    // The public URL pattern is the single thing the recruiter-side AI
    // agent connects to. If we ever change it, this test forces an
    // explicit decision instead of silent drift.
    expect(doc).toMatch(/\/mcp\/public/);
    expect(doc).toMatch(/get_career_packet/);
    expect(doc).toMatch(/get_story_bank_public/);
  });
});
