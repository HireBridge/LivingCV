import Anthropic from '@anthropic-ai/sdk';
import type { ChatRequest, ChatResult, LlmAdapter, ToolCall } from './types.js';

// Anthropic Messages API with real multi-turn tool calling (§5 of REMEDIATION.md).
// Tool results are fed in as assistant tool_use blocks followed by user
// tool_result blocks — the canonical Anthropic shape.

export const anthropicAdapter: LlmAdapter = {
  name: 'anthropic',
  async chat(req: ChatRequest): Promise<ChatResult> {
    if (!req.apiKey) throw new Error('Anthropic API key not set (agent.llm_api_key).');
    const client = new Anthropic({ apiKey: req.apiKey });

    const tools = req.tools.map((t: { name: string; description: string; inputSchema: Record<string, unknown> }) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as unknown as Anthropic.Messages.Tool.InputSchema,
    })) as unknown as Anthropic.Messages.Tool[];

    // Build the full message list: the caller's history + any pending
    // tool results from the prior turn, expressed as native blocks.
    const rawMessages: Anthropic.Messages.MessageParam[] = [];

    // 1. Copy the caller's conversation history.
    for (const m of req.messages) {
      rawMessages.push({ role: m.role as 'user' | 'assistant', content: m.content });
    }

    // 2. If the prior turn produced tool calls, embed them as a proper
    //    assistant tool_use + user tool_result pair.
    if (req.toolResults && req.toolResults.length > 0) {
      // Assistant message with one tool_use block per tool call.
      rawMessages.push({
        role: 'assistant',
        content: req.toolResults.map((r: { toolCallId: string; toolName: string; args: Record<string, unknown>; content: string }) => ({
          type: 'tool_use' as const,
          id: r.toolCallId,
          name: r.toolName,
          input: r.args,
        })),
      } as Anthropic.Messages.MessageParam);

      // User message with one tool_result block per tool call.
      rawMessages.push({
        role: 'user',
        content: req.toolResults.map((r: { toolCallId: string; toolName: string; args: Record<string, unknown>; content: string }) => ({
          type: 'tool_result' as const,
          tool_use_id: r.toolCallId,
          content: r.content,
        })),
      } as Anthropic.Messages.MessageParam);
    }

    const stream = client.messages.stream({
      model: req.model,
      max_tokens: 4096,
      system: req.system,
      tools,
      messages: rawMessages,
    });

    let text = '';
    const toolCalls: ToolCall[] = [];
    let pendingTool: { id: string; name: string; input: unknown } | null = null;
    for await (const ev of stream) {
      if (ev.type === 'content_block_start') {
        const block = ev.content_block;
        if (block.type === 'tool_use') {
          pendingTool = { id: block.id, name: block.name, input: {} };
        }
      } else if (ev.type === 'content_block_delta') {
        if (ev.delta.type === 'text_delta') {
          text += ev.delta.text;
          if (req.onToken) req.onToken(ev.delta.text);
        } else if (ev.delta.type === 'input_json_delta' && pendingTool) {
          pendingTool.input = JSON.parse(ev.delta.partial_json ?? '{}');
        }
      } else if (ev.type === 'content_block_stop' && pendingTool) {
        toolCalls.push({
          id: pendingTool.id,
          name: pendingTool.name,
          args: (pendingTool.input ?? {}) as Record<string, unknown>,
        });
        pendingTool = null;
      }
    }
    const stopReason = toolCalls.length > 0 ? 'tool_use' : 'end_turn';
    return { text, toolCalls, stopReason };
  },
};
