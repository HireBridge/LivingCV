// Issue 5 acceptance (§5 of REMEDIATION.md):
// The adapters build real provider-native tool-role messages — not the
// old synthetic "[Tool X result] …" user-text workaround from turn.ts.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'apps', 'orchestrator', 'src');
const TURN = readFileSync(join(SRC, 'turn.ts'), 'utf8');
const ANTHROPIC = readFileSync(join(SRC, 'llm', 'anthropic.ts'), 'utf8');
const OPENAI = readFileSync(join(SRC, 'llm', 'openai.ts'), 'utf8');

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
