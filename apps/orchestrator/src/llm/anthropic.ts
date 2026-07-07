import Anthropic from '@anthropic-ai/sdk';
import type { ChatRequest, ChatResult, LlmAdapter, ToolCall } from './types.js';

// Anthropic Messages API. Tool use is the native function-calling shape there.
// System goes in the top-level `system` field. `onToken` is invoked with each
// text delta from the streaming response.

export const anthropicAdapter: LlmAdapter = {
  name: 'anthropic',
  async chat(req: ChatRequest): Promise<ChatResult> {
    if (!req.apiKey) throw new Error('Anthropic API key not set (agent.llm_api_key).');
    const client = new Anthropic({ apiKey: req.apiKey });

    // Translate our narrower ToolDef to Anthropic's Tool shape.
    const tools = req.tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as unknown as Anthropic.Messages.Tool.InputSchema,
    })) as unknown as Anthropic.Messages.Tool[];

    // System goes to the top-level `system` field. Pass only user/assistant
    // messages here. Our request shape disallows 'system' in messages anyway,
    // but TS would still complain — assert the narrower type.
    const messages = req.messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })) as Anthropic.Messages.MessageParam[];

    const stream = client.messages.stream({
      model: req.model,
      max_tokens: 4096,
      system: req.system,
      tools,
      messages,
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
