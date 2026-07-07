// The chat "brain" — runTurn(sessionId, userText, onEvent). §7.
//
// One full turn: build the active toolset (gate vs post-gate), call the LLM,
// execute any tool calls (MCP public or local), append tool results, repeat
// until the LLM ends its turn or MAX_TOOL_ROUNDS is hit. Streams events to the
// caller via onEvent() for SSE delivery.

import { randomUUID } from 'node:crypto';
import type { Db } from '@mohith-das/portfolio-db';
import { LLM_PROVIDERS, SETTING_KEYS } from '@mohith-das/portfolio-shared';
import { getSetting } from './settings.js';
import { MAX_TOOL_ROUNDS, MAX_INPUT_CHARS } from './llm/types.js';
import type { ChatMessage, ToolCall } from './llm/types.js';
import { getLlmConfig } from './llm/index.js';
import { connectMcpPublic, callTool, type McpSession } from './mcpClient.js';
import {
  listProjectsToolDefs, listProjectsImpl,
  getCaseStudyToolDefs, getCaseStudyImpl,
} from './localTools.js';
import { submitWorkEmailToolDef, submitWorkEmailImpl } from './gate.js';
import {
  bumpSessionActivity, getSession, recordChatMessage, setSessionBlocked,
} from './db.js';
import { buildSystemPrompt } from './prompts.js';
import { checkPreTurnGuards } from './limits.js';

export type SseEvent =
  | { type: 'token'; text: string }
  | { type: 'tool_start'; id: string; name: string }
  | { type: 'tool_end'; id: string; name: string; ok: boolean }
  | { type: 'done' }
  | { type: 'error'; message: string };

const DEFAULT_JOBOPS_BASE = process.env.JOBOPS_BASE_URL || 'http://jobops:7891';

export async function runTurn(
  db: Db,
  sessionId: string,
  userText: string,
  onEvent: (ev: SseEvent) => void,
): Promise<void> {
  const session = getSession(db, sessionId);
  if (!session) {
    onEvent({ type: 'error', message: 'session not found' });
    return;
  }

  // Guard.
  const guard = checkPreTurnGuards(db, session.message_count, userText.length);
  if (!guard.allowed) {
    setSessionBlocked(db, sessionId, guard.reason ?? 'blocked');
    bumpSessionActivity(db, sessionId, false);
    recordChatMessage(db, {
      sessionId, role: 'user', content: userText.slice(0, 200), toolName: null, toolArgs: null, toolResult: null,
    });
    onEvent({ type: 'error', message: `blocked: ${guard.reason}` });
    return;
  }

  const llm = getLlmConfig(db);
  if (!llm) {
    onEvent({ type: 'error', message: 'agent not configured (admin: set agent.llm_provider/api_key/model)' });
    return;
  }

  // Build toolset.
  const tools = session.email_verified === 0
    ? [submitWorkEmailToolDef()]
    : [submitWorkEmailToolDef(), ...listProjectsToolDefs(), ...getCaseStudyToolDefs()];

  // Connect to jobops /mcp/public iff we're post-gate. Pre-gate we hand the LLM
  // only the submit_work_email tool (no MCP), so a hostile prompt cannot reach
  // any jobops tool at all — §2 invariant 4 in action.
  let mcp: McpSession | null = null;
  if (session.email_verified === 1) {
    try {
      mcp = await connectMcpPublic(DEFAULT_JOBOPS_BASE);
      for (const t of mcp.tools) {
        tools.push({ name: t.name, description: t.description, inputSchema: t.inputSchema });
      }
    } catch (e) {
      onEvent({ type: 'error', message: `mcp connect failed: ${(e as Error).message}` });
      return;
    }
  }

  const siteTitle = String(getSetting(db, SETTING_KEYS.siteTitle) || 'Portfolio');
  const systemPrompt = buildSystemPrompt(db, siteTitle);

  // Conversation (this turn) — we mutate this on each round, then loop.
  // We persist user/assistant/tool messages to chat_messages at each step.
  const messages: ChatMessage[] = [{ role: 'user', content: userText.slice(0, MAX_INPUT_CHARS) }];
  recordChatMessage(db, {
    sessionId, role: 'user', content: userText.slice(0, MAX_INPUT_CHARS),
    toolName: null, toolArgs: null, toolResult: null,
  });

  let finalText = '';

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const r = await llm.adapter.chat({
      system: systemPrompt,
      messages,
      tools,
      model: llm.model,
      apiKey: llm.apiKey,
      onToken: (chunk) => onEvent({ type: 'token', text: chunk }),
    });
    finalText = r.text;

    if (r.stopReason !== 'tool_use' || r.toolCalls.length === 0) {
      break;
    }

    // Persist assistant turn (its text + the tool calls it made).
    recordChatMessage(db, {
      sessionId, role: 'assistant', content: r.text,
      toolName: null, toolArgs: null, toolResult: null,
    });
    if (r.text) {
      // ensure last user message has a paired assistant in our `messages` for next round
      messages.push({ role: 'assistant', content: r.text });
    }

    // Execute each tool call (in declared order) and append a synthetic tool
    // response. The LLM loop is via the next chat() call where we add a
    // synthetic "tool" turn. We do that by passing synthetic messages via the
    // next Anthropic request — but our adapter does not yet support tool role
    // turns. For Phase 2 we instead push the tool inputs back into the user
    // slot for the next round; this is a known limitation documented for Phase 5.
    // The simpler approach is to feed tool results as a synthetic user message.
    for (const tc of r.toolCalls) {
      onEvent({ type: 'tool_start', id: tc.id, name: tc.name });
      const result = await executeTool(db, mcp, sessionId, tc);
      onEvent({ type: 'tool_end', id: tc.id, name: tc.name, ok: result.ok });
      recordChatMessage(db, {
        sessionId, role: 'tool', content: result.ok ? result.valueText : '',
        toolName: tc.name, toolArgs: tc.args, toolResult: result.valueText,
      });
      messages.push({
        role: 'user',
        content:
          `[Tool ${tc.name} result]\n` +
          (result.ok ? JSON.stringify(result.valueText).slice(0, 2000) : `ERROR: ${result.valueText}`),
      });
    }
  }

  // Persist final assistant text.
  recordChatMessage(db, {
    sessionId, role: 'assistant', content: finalText,
    toolName: null, toolArgs: null, toolResult: null,
  });
  bumpSessionActivity(db, sessionId, true);

  if (mcp) await mcp.close();
  onEvent({ type: 'done' });
}

interface ToolResult {
  ok: boolean;
  valueText: string;
}

async function executeTool(
  db: Db,
  mcp: McpSession | null,
  sessionId: string,
  call: ToolCall,
): Promise<ToolResult> {
  if (call.name === 'submit_work_email') {
    const r = submitWorkEmailImpl(db, sessionId, call.args);
    return { ok: r.ok, valueText: r.message };
  }
  if (call.name === 'list_projects') {
    return { ok: true, valueText: JSON.stringify(listProjectsImpl(db)) };
  }
  if (call.name === 'get_case_study') {
    const r = getCaseStudyImpl(db, call.args);
    return r ? { ok: true, valueText: JSON.stringify(r) } : { ok: false, valueText: 'case study not found or not published' };
  }
  // MCP tool (post-gate) — narrow to jobops /mcp/public toolset.
  if (mcp && mcp.tools.some((t) => t.name === call.name)) {
    try {
      const r = await callTool(mcp, call.name, call.args);
      return { ok: true, valueText: JSON.stringify(r).slice(0, 4000) };
    } catch (e) {
      return { ok: false, valueText: (e as Error).message.slice(0, 400) };
    }
  }
  return { ok: false, valueText: 'unknown tool' };
}

void randomUUID; // keep linter quiet if unused
void LLM_PROVIDERS;
