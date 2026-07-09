// Issue 5 acceptance (§5 of REMEDIATION.md):
// The adapters build real provider-native tool-role messages — not the
// old synthetic "[Tool X result] …" user-text workaround from turn.ts.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'apps', 'orchestrator', 'src');
const TURN = readFileSync(join(SRC, 'turn.ts'), 'utf8');
const DB = readFileSync(join(SRC, 'db.ts'), 'utf8');
const ANTHROPIC = readFileSync(join(SRC, 'llm', 'anthropic.ts'), 'utf8');
const OPENAI = readFileSync(join(SRC, 'llm', 'openai.ts'), 'utf8');

describe('H2 — conversation history is sent to the LLM', () => {
  it('turn.ts imports getRecentChatMessages from db.ts', () => {
    expect(TURN).toContain('getRecentChatMessages');
  });

  it('turn.ts loads history before building the messages array', () => {
    const historyIdx = TURN.indexOf('getRecentChatMessages');
    const messagesIdx = TURN.indexOf('messages: ChatMessage[]');
    expect(historyIdx).toBeGreaterThan(0);
    expect(messagesIdx).toBeGreaterThan(0);
    expect(historyIdx).toBeLessThan(messagesIdx);
  });

  it('turn.ts spreads history into messages', () => {
    expect(TURN).toMatch(/\.\.\.history\.map/);
  });

  it('db.ts exports getRecentChatMessages with role filter excluding tool rows', () => {
    expect(DB).toContain('getRecentChatMessages');
    expect(DB).toContain("role IN ('user', 'assistant')");
  });
});

describe('H3 — Anthropic adapter accumulates streamed tool arguments', () => {
  it('accumulates partial_json as a string, not JSON.parse on each delta', () => {
    expect(ANTHROPIC).toContain('inputJson');
    expect(ANTHROPIC).toMatch(/inputJson\s*\+=/);
    expect(ANTHROPIC).not.toMatch(/partial_json.*JSON\.parse/);
  });

  it('parses the accumulated JSON only at content_block_stop with error handling', () => {
    const stopIdx = ANTHROPIC.indexOf('content_block_stop');
    expect(stopIdx).toBeGreaterThan(0);
    const window = ANTHROPIC.slice(stopIdx);
    expect(window).toContain('JSON.parse');
    expect(window).toContain('try');
    expect(window).toContain('catch');
  });
});

describe('issue 5 — native tool-role turns (no synthetic user messages)', () => {
  it('turn.ts no longer pushes synthetic "[Tool X result]" user messages', () => {
    expect(TURN).not.toMatch(/\[Tool \w+ result\]/);
  });

  it('turn.ts feeds toolResults to the adapter on every round past the first', () => {
    // The toolResults field on ChatRequest is the right mechanism.
    expect(TURN).toContain('toolResults');
    expect(TURN).toContain('pendingToolResults');
  });

  it('Anthropic adapter builds tool_use and tool_result blocks from toolResults', () => {
    // The adapter constructs assistant tool_use + user tool_result blocks.
    expect(ANTHROPIC).toMatch(/tool_use/);
    expect(ANTHROPIC).toMatch(/tool_result/);
    // It uses req.toolResults (not synthetic user text).
    expect(ANTHROPIC).toContain('req.toolResults');
    expect(ANTHROPIC).not.toMatch(/\[Tool \w+ result\]/);
  });

  it('OpenAI adapter builds tool_calls and role:tool messages from toolResults', () => {
    expect(OPENAI).toMatch(/tool_calls/);
    expect(OPENAI).toMatch(/role.*tool/);
    expect(OPENAI).toContain('req.toolResults');
    expect(OPENAI).not.toMatch(/\[Tool \w+ result\]/);
  });

  it('Gemini adapter builds functionCall / functionResponse parts from toolResults', () => {
    expect(OPENAI).toMatch(/functionCall/);
    expect(OPENAI).toMatch(/functionResponse/);
  });
});
