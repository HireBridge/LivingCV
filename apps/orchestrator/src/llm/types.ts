// LLM adapter (§7). One interface; three providers (Anthropic, OpenAI, Gemini).
// Provider + key + model are read from app_settings at session start. The tool-
// calling shape is normalized: each provider maps its native function-calling
// representation into ToolCall {name, args} and the orchestrator dispatches.

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties?: Record<string, unknown>; required?: string[]; additionalProperties?: unknown };
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  // For prior tool-call turns, we attach a synthetic assistant+tool block via provider mapping.
}

export interface ChatRequest {
  system: string;
  messages: ChatMessage[];
  tools: ToolDef[];
  model: string;
  apiKey: string;
  signal?: AbortSignal;
  onToken?: (chunk: string) => void;
}

export interface ChatResult {
  text: string;
  toolCalls: ToolCall[];
  // When stop_reason === 'tool_use', the caller should execute the tools and loop
  // (up to MAX_TOOL_ROUNDS). When 'end_turn', the caller finishes the turn.
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'error';
}

export interface LlmAdapter {
  readonly name: 'anthropic' | 'openai' | 'gemini';
  chat(req: ChatRequest): Promise<ChatResult>;
}

export interface LlmConfig {
  provider: 'anthropic' | 'openai' | 'gemini';
  apiKey: string;
  model: string;
}

// Limits — §7.
export const MAX_TOOL_ROUNDS = 6;
export const MAX_INPUT_CHARS = 4000;
