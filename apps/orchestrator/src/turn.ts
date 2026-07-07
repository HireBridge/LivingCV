// The chat "brain" — runTurn(sessionId, userText, onEvent). §7.
//
// One full turn: build the active toolset (gate vs post-gate), call the LLM,
// execute any tool calls (MCP public or local), feed tool results back via
// proper native tool-role messages (not synthetic user text), and repeat until
// the LLM ends its turn or MAX_TOOL_ROUNDS is hit. Streams assistant tokens
// via onEvent() for SSE delivery.

import { randomUUID } from 'node:crypto';
import type { Db } from '@livingcv/db';
import { LLM_PROVIDERS, SETTING_KEYS } from '@livingcv/shared';
import { getSetting } from './settings.js';
import { MAX_TOOL_ROUNDS, MAX_INPUT_CHARS } from './llm/types.js';
import type { ChatMessage, ToolCall, ToolResult } from './llm/types.js';
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

function searchWebToolDef() {
  return {
    name: 'search_web',
    description: 'Search the public internet for current events, news, or factual information not in your training data.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'The search query' }
      },
      required: ['query']
    }
  };
}

async function searchWebImpl(provider: string, apiKey: string, query: string): Promise<string> {
  if (provider === 'tavily') {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey, query, search_depth: 'basic' })
    });
    if (!res.ok) throw new Error(`Tavily error: ${res.statusText}`);
    const data = await res.json() as { results?: unknown[] };
    return JSON.stringify(data.results || []);
  }
  // DuckDuckGo fallback
  const res = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`);
  if (!res.ok) throw new Error(`DuckDuckGo error: ${res.statusText}`);
  const data = await res.json() as { Abstract?: string; RelatedTopics?: Array<{ Text?: string }> };
  if (data.Abstract) return data.Abstract;
  if (data.RelatedTopics && data.RelatedTopics.length > 0) {
    return JSON.stringify(data.RelatedTopics.map((t) => t.Text).filter(Boolean));
  }
  return "No results found.";
}

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

  const searchProvider = getSetting(db, SETTING_KEYS.agentSearchProvider);
  if (searchProvider && searchProvider !== 'none') {
    tools.push(searchWebToolDef());
  }

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

  // Conversation history. We persist user/assistant/tool messages to
  // chat_messages at each step, and pass them to the LLM as plain
  // ChatMessage[]. Tool results from each round are bundled as
  // `toolResults` on the next ChatRequest — each adapter constructs
  // its own native tool-role messages from them.
  const messages: ChatMessage[] = [{ role: 'user', content: userText.slice(0, MAX_INPUT_CHARS) }];
  recordChatMessage(db, {
    sessionId, role: 'user', content: userText.slice(0, MAX_INPUT_CHARS),
    toolName: null, toolArgs: null, toolResult: null,
  });

  let finalText = '';
  let pendingToolResults: ToolResult[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const r = await llm.adapter.chat({
      system: systemPrompt,
      messages,
      tools,
      model: llm.model,
      apiKey: llm.apiKey,
      onToken: (chunk: string) => onEvent({ type: 'token', text: chunk }),
      toolResults: pendingToolResults.length > 0 ? pendingToolResults : undefined,
    });
    finalText = r.text;
    // Pending results consumed — next round starts fresh.
    pendingToolResults = [];

    if (r.stopReason !== 'tool_use' || r.toolCalls.length === 0) {
      break;
    }

    // Persist the assistant turn that made tool calls (the text portion).
    recordChatMessage(db, {
      sessionId, role: 'assistant', content: r.text,
      toolName: null, toolArgs: null, toolResult: null,
    });
    if (r.text) {
      messages.push({ role: 'assistant', content: r.text });
    }

    // Execute each tool call. Build native tool-result payloads
    // that the adapter will turn into tool-role messages on the
    // next LLM call (tool_use/tool_result for Anthropic,
    // tool_calls/tool for OpenAI, functionCall/functionResponse
    // for Gemini).
    const results: ToolResult[] = [];
    for (const tc of r.toolCalls) {
      onEvent({ type: 'tool_start', id: tc.id, name: tc.name });
      const result = await executeTool(db, mcp, sessionId, tc);
      onEvent({ type: 'tool_end', id: tc.id, name: tc.name, ok: result.ok });
      recordChatMessage(db, {
        sessionId, role: 'tool', content: result.ok ? result.valueText : '',
        toolName: tc.name, toolArgs: tc.args, toolResult: result.valueText,
      });
      results.push({
        toolCallId: tc.id,
        toolName: tc.name,
        args: tc.args,
        content: result.ok ? result.valueText : `ERROR: ${result.valueText}`,
      });
    }
    pendingToolResults = results;

    // The adapter will embed these as native tool-role messages in the
    // next `chat()` call via the `toolResults` field — no need to push
    // synthetic user messages into `messages`.
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

interface ToolResultInternal {
  ok: boolean;
  valueText: string;
}

async function executeTool(
  db: Db,
  mcp: McpSession | null,
  sessionId: string,
  call: ToolCall,
): Promise<ToolResultInternal> {
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
  if (call.name === 'search_web') {
    const searchProvider = getSetting(db, SETTING_KEYS.agentSearchProvider);
    const searchApiKey = getSetting(db, SETTING_KEYS.agentSearchApiKey) || '';
    if (!searchProvider) return { ok: false, valueText: 'Search not configured' };
    try {
      const q = typeof call.args.query === 'string' ? call.args.query : '';
      const text = await searchWebImpl(searchProvider, searchApiKey, q);
      return { ok: true, valueText: text.slice(0, 4000) };
    } catch (e) {
      return { ok: false, valueText: (e as Error).message.slice(0, 400) };
    }
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

void randomUUID;
void LLM_PROVIDERS;
