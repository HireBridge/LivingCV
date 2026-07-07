// LLM adapter (§7). One interface; three providers (Anthropic, OpenAI, Gemini).
// Each adapter builds its own native tool-role messages internally — the turn
// loop passes tool results back as `ChatRequest.toolResults` and the adapter
// interleaves the correct provider-specific message blocks (tool_use/tool_result,
// tool_calls/tool, functionCall/functionResponse).

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

export interface ToolResult {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;   // original tool call args — needed by Anthropic tool_use blocks
  content: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  system: string;
  messages: ChatMessage[];
  tools: ToolDef[];
  model: string;
  apiKey: string;
  onToken?: (chunk: string) => void;
  signal?: AbortSignal;

  // Results from tool calls in the prior turn, if any. Each adapter uses
  // these to construct its native tool-role messages before the next API call.
  // Empty/undefined = fresh call with no tool context.
  toolResults?: ToolResult[];
}

export interface ChatResult {
  text: string;
  toolCalls: ToolCall[];
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
