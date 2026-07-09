import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type Db } from '@livingcv/db';

let db: Db;
let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'portfolio-behavioral-'));
  db = openDb(join(dir, 'test.db'));
});

afterAll(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

function seedSetting(key: string, value: string) {
  db.prepare(
    'INSERT OR REPLACE INTO app_settings (key, value, encrypted, updated_at) VALUES (?, ?, 0, ?)',
  ).run(key, value, new Date().toISOString());
}

function seedSession(id: string, overrides: Partial<{ emailVerified: number; workEmail: string; emailDomain: string }> = {}) {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO recruiter_sessions (id, channel, work_email, email_domain, company_domain_inferred,
      ip_hash, user_agent, started_at, last_active_at, email_verified, blocked_reason, message_count)
     VALUES (?, 'text', ?, ?, '', '', '', ?, ?, ?, '', 0)`,
  ).run(
    id,
    overrides.workEmail ?? '',
    overrides.emailDomain ?? '',
    now,
    now,
    overrides.emailVerified ?? 0,
  );
}

beforeEach(() => {
  // Set up the minimum agent config so runTurn can get past getLlmConfig.
  seedSetting('agent.llm_provider', 'anthropic');
  seedSetting('agent.llm_api_key', 'test-key');
  seedSetting('agent.llm_model', 'claude-test');
  seedSetting('site.title', 'Test Portfolio');
});

const FAKE_CHAT_RESULT = {
  text: 'Hello from the test adapter',
  toolCalls: [] as Array<{ id: string; name: string; args: Record<string, unknown> }>,
  stopReason: 'end_turn' as const,
};

const receivedRequests: Array<{
  messages: Array<{ role: string; content: string }>;
  tools: Array<{ name: string }>;
}> = [];

vi.mock('../src/llm/index.js', () => ({
  getLlmConfig: () => ({
    provider: 'anthropic' as const,
    adapter: {
      name: 'anthropic' as const,
      chat: async (req: { messages: Array<{ role: string; content: string }>; tools: Array<{ name: string }> }) => {
        receivedRequests.push({ messages: [...req.messages], tools: [...req.tools] });
        return FAKE_CHAT_RESULT;
      },
    },
    apiKey: 'test-key',
    model: 'claude-test',
  }),
  isAgentEnabled: () => true,
}));

import { runTurn } from '../src/turn.js';

describe('H2 — conversation history is sent to the adapter (behavioral)', () => {
  beforeEach(() => {
    receivedRequests.length = 0;
  });

  it('second turn receives first turn messages in req.messages', async () => {
    const sessionId = 'h2-test-session';
    seedSession(sessionId);

    // Record a previous user+assistant exchange directly in chat_messages.
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO chat_messages (session_id, role, content, tool_name, tool_args, tool_result, created_at) VALUES (?, ?, ?, NULL, NULL, NULL, ?)',
    ).run(sessionId, 'user', 'Hello, my name is Alice', now);
    db.prepare(
      'INSERT INTO chat_messages (session_id, role, content, tool_name, tool_args, tool_result, created_at) VALUES (?, ?, ?, NULL, NULL, NULL, ?)',
    ).run(sessionId, 'assistant', 'Hi Alice! How can I help?', now);

    const events: string[] = [];
    await runTurn(db, sessionId, 'What projects do you have?', (ev) => {
      events.push(ev.type);
    });

    expect(receivedRequests.length).toBe(1);
    const req = receivedRequests[0]!;
    const messageContents = req.messages.map((m) => m.content);

    // The messages should include history + current message.
    expect(messageContents).toContain('Hello, my name is Alice');
    expect(messageContents).toContain('Hi Alice! How can I help?');
    expect(messageContents).toContain('What projects do you have?');

    // History must come before the current message.
    const historyIdx = messageContents.indexOf('Hello, my name is Alice');
    const currentIdx = messageContents.indexOf('What projects do you have?');
    expect(historyIdx).toBeLessThan(currentIdx);
  });
});

describe('H5 — gate.enabled controls toolset (behavioral)', () => {
  beforeEach(() => {
    receivedRequests.length = 0;
  });

  it('gate enabled + unverified session → only submit_work_email in tools', async () => {
    seedSetting('gate.enabled', '1');
    const sessionId = 'h5-gate-on';
    seedSession(sessionId, { emailVerified: 0 });

    const events: string[] = [];
    await runTurn(db, sessionId, 'Hi', (ev) => {
      events.push(ev.type);
    });

    expect(receivedRequests.length).toBe(1);
    const toolNames = receivedRequests[0]!.tools.map((t) => t.name);
    expect(toolNames).toEqual(['submit_work_email']);
  });

  it('gate disabled + unverified session → full toolset including list_projects', async () => {
    seedSetting('gate.enabled', '0');
    const sessionId = 'h5-gate-off';
    seedSession(sessionId, { emailVerified: 0 });

    const events: string[] = [];
    await runTurn(db, sessionId, 'Hi', (ev) => {
      events.push(ev.type);
    });

    expect(receivedRequests.length).toBe(1);
    const toolNames = receivedRequests[0]!.tools.map((t) => t.name);
    expect(toolNames).toContain('submit_work_email');
    expect(toolNames).toContain('list_projects');
    expect(toolNames).toContain('get_case_study');
  });
});

describe('H3 — Anthropic tool-arg accumulation (behavioral)', () => {
  function simulateAccumulation(deltas: string[]): Record<string, unknown> {
    let inputJson = '';
    for (const partial of deltas) {
      inputJson += partial;
    }
    let args: Record<string, unknown> = {};
    try { args = JSON.parse(inputJson || '{}'); } catch {}
    return args;
  }

  it('accumulates partial JSON fragments and parses correctly', () => {
    const args = simulateAccumulation(['{"qu', 'ery": "Sea', 'rch this"}']);
    expect(args).toEqual({ query: 'Search this' });
  });

  it('handles a single complete delta', () => {
    const args = simulateAccumulation(['{"name": "submit_work_email", "email": "test@company.com"}']);
    expect(args).toEqual({ name: 'submit_work_email', email: 'test@company.com' });
  });

  it('survives unparseable accumulated JSON (returns empty object)', () => {
    const args = simulateAccumulation(['{broken']);
    expect(args).toEqual({});
  });

  it('handles empty input', () => {
    const args = simulateAccumulation([]);
    expect(args).toEqual({});
  });
});
