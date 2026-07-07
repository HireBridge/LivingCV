import type { ChatRequest, ChatResult, LlmAdapter } from './types.js';

// OpenAI chat completions with tool_calls/role:tool multi-turn support (§5).
// When the caller passes toolResults from a prior turn, the adapter builds:
//   1. An assistant message with the original tool_calls
//   2. One role:"tool" message per result, keyed by tool_call_id
// The model sees these as standard multi-turn tool-call history.

export const openaiAdapter: LlmAdapter = {
  name: 'openai',
  async chat(req: ChatRequest): Promise<ChatResult> {
    if (!req.apiKey) throw new Error('OpenAI API key not set (agent.llm_api_key).');

    const openaiTools = req.tools.map((t: { name: string; description: string; inputSchema: Record<string, unknown> }) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));

    const rawMessages: Array<Record<string, unknown>> = [];
    for (const m of req.messages) {
      rawMessages.push({ role: m.role, content: m.content });
    }

    // Append tool-call + tool-result messages for the prior turn.
    if (req.toolResults && req.toolResults.length > 0) {
      rawMessages.push({
        role: 'assistant',
        content: null,
        tool_calls: req.toolResults.map((r: { toolCallId: string; toolName: string; args: Record<string, unknown>; content: string }) => ({
          id: r.toolCallId,
          type: 'function',
          function: { name: r.toolName, arguments: JSON.stringify(r.args) },
        })),
      });
      for (const r of req.toolResults) {
        rawMessages.push({
          role: 'tool',
          tool_call_id: r.toolCallId,
          content: r.content,
        });
      }
    }

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${req.apiKey}`,
      },
      signal: req.signal,
      body: JSON.stringify({
        model: req.model,
        messages: rawMessages,
        tools: openaiTools.length > 0 ? openaiTools : undefined,
        stream: true,
        stream_options: { include_usage: true },
      }),
    });
    if (!r.ok) {
      const err = await r.text().catch(() => '');
      throw new Error(`OpenAI API error ${r.status}: ${err.slice(0, 200)}`);
    }

    let text = '';
    const toolCalls: ChatResult['toolCalls'] = [];
    const toolCallAccum: Map<number, { id: string; name: string; args: string }> = new Map();

    const reader = r.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const chunk = JSON.parse(data);
          if (chunk.choices?.[0]?.delta?.content) {
            const delta: string = chunk.choices[0].delta.content;
            text += delta;
            if (req.onToken) req.onToken(delta);
          }
          if (chunk.choices?.[0]?.delta?.tool_calls) {
            for (const tc of chunk.choices[0].delta.tool_calls) {
              const idx = Number(tc.index);
              if (tc.id) {
                toolCallAccum.set(idx, { id: tc.id, name: tc.function?.name ?? '', args: tc.function?.arguments ?? '' });
              } else if (tc.function?.arguments && toolCallAccum.has(idx)) {
                toolCallAccum.get(idx)!.args += tc.function.arguments;
              }
            }
          }
        } catch { /* ignore malformed chunks */ }
      }
    }
    for (const [, tc] of toolCallAccum) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.args); } catch {}
      toolCalls.push({ id: tc.id, name: tc.name, args });
    }
    const stopReason = toolCalls.length > 0 ? 'tool_use' : 'end_turn';
    return { text, toolCalls, stopReason };
  },
};

export const geminiAdapter: LlmAdapter = {
  name: 'gemini',
  async chat(req: ChatRequest): Promise<ChatResult> {
    if (!req.apiKey) throw new Error('Gemini API key not set (agent.llm_api_key).');

    const geminiTools = req.tools.length > 0 ? [{
      functionDeclarations: req.tools.map((t: { name: string; description: string; inputSchema: Record<string, unknown> }) => ({
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      })),
    }] : undefined;

    const contents: Array<Record<string, unknown>> = [];
    for (const m of req.messages) {
      contents.push({ role: m.role === 'assistant' ? 'model' : m.role, parts: [{ text: m.content }] });
    }

    if (req.toolResults && req.toolResults.length > 0) {
      contents.push({
        role: 'model',
        parts: req.toolResults.map((r: { toolCallId: string; toolName: string; args: Record<string, unknown>; content: string }) => ({
          functionCall: { name: r.toolName, args: r.args },
        })),
      });
      contents.push({
        role: 'user',
        parts: req.toolResults.map((r: { toolCallId: string; toolName: string; args: Record<string, unknown>; content: string }) => ({
          functionResponse: { name: r.toolName, response: { content: r.content } },
        })),
      });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${req.model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(req.apiKey)}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: req.signal,
      body: JSON.stringify({
        systemInstruction: req.system ? { parts: [{ text: req.system }] } : undefined,
        contents,
        tools: geminiTools,
      }),
    });
    if (!r.ok) {
      const err = await r.text().catch(() => '');
      throw new Error(`Gemini API error ${r.status}: ${err.slice(0, 200)}`);
    }

    let text = '';
    const toolCalls: ChatResult['toolCalls'] = [];
    const reader = r.body!.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        try {
          const chunk = JSON.parse(data);
          const candidates = chunk.candidates ?? [];
          for (const c of candidates) {
            for (const part of c.content?.parts ?? []) {
              if (part.text) { text += part.text; if (req.onToken) req.onToken(part.text); }
              if (part.functionCall) {
                toolCalls.push({
                  id: `${part.functionCall.name}-${Date.now()}`,
                  name: part.functionCall.name,
                  args: part.functionCall.args ?? {},
                });
              }
            }
          }
        } catch { /* ignore malformed */ }
      }
    }
    const stopReason = toolCalls.length > 0 ? 'tool_use' : 'end_turn';
    return { text, toolCalls, stopReason };
  },
};
