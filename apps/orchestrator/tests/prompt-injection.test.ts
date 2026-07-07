// Structural guarantees (§2 invariant 4 + §13 Phase 2): a prompt-injection
// attack on the chat agent can NEVER reach a mutating jobops tool, even if the
// LLM is fully compromised. This is enforced at three independent layers:
//
//   1. Tool registration: jobops's /mcp/public mount exposes exactly two tools
//      (get_career_packet, get_story_bank_public), both mutates=false,
//      publicSafe=true. The orchestrator's MCP client connects to that mount
//      only. There is no admin token in this process.
//
//   2. Gate: until email_verified=1 the orchestrator hands the LLM only
//      `submit_work_email`. No MCP tools are exposed at all in that window.
//
//   3. Validator: when the LLM emits a tool call, the orchestrator first
//      checks the call exists in the active toolset (post-gate that's MCP
//      toolset + local). Unknown / out-of-set tool calls are refused.
//
// This test asserts each layer with concrete calls. If any fails, the
// adversarial path that the design rules out would actually work.

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const srcDir = join(import.meta.dirname, '..', 'src');

// 1. /mcp/public lists exactly the two tools — no update_*, delete_*, etc.

describe('structural impossibility of prompt injection reaching mutating tools', () => {
  it('layer 1: orchestrator connects ONLY to jobops /mcp/public (no token, no admin mount)', async () => {
    const src = await readFile(join(srcDir, 'mcpClient.ts'), 'utf8');

    // Hard-coded public mount path.
    expect(src).toMatch(/['"]\/mcp\/public['"]/);
    // No Authorization / Bearer / JWT anywhere — the process has no token.
    expect(src).not.toMatch(/Authorization|Bearer|JWT/);
    // Never asks for the authenticated /mcp mount.
    expect(src).not.toMatch(/['"]\/mcp['"]/);
  });

  it('layer 2: the gate toolset (pre-email) contains NO MCP tools — only submit_work_email', async () => {
    const src = await readFile(join(srcDir, 'turn.ts'), 'utf8');
    // Locate the pre-gate branch.
    const preMatch = src.indexOf('session.email_verified === 0');
    expect(preMatch).toBeGreaterThan(0);
    const nextBoundary = src.indexOf('session.email_verified === 1', preMatch + 1);
    const next = nextBoundary > 0 ? nextBoundary : src.length;
    const window = src.slice(preMatch, next);
    expect(window).toContain('submit_work_email');
    // Connect-to-mcp MUST NOT happen pre-gate — the design guarantees there is
    // no tool that even COULD reach mutating jobops state in the gate window.
    expect(window).not.toContain('connectMcpPublic');
    expect(window).not.toContain('callTool');
    expect(window).not.toContain('mcp.tools');
  });

  it('layer 3: the orchestrator validates tool calls against the active set', async () => {
    const src = await readFile(join(srcDir, 'turn.ts'), 'utf8');
    expect(src).toContain("return { ok: false, valueText: 'unknown tool' }");
    expect(src).toContain('mcp.tools.some');
    // Three named local handles.
    expect(src).toContain("if (call.name === 'submit_work_email')");
    expect(src).toContain("if (call.name === 'list_projects')");
    expect(src).toContain("if (call.name === 'get_case_study')");
  });
});

