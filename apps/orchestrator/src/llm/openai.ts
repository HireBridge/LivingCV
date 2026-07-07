import type { LlmAdapter } from './types.js';

// Phase 2 ships Anthropic fully. OpenAI and Gemini are routed via the same
// interface; calls raise a clear error so a misconfiguration surfaces in the
// orchestrator logs (instead of silently leaking through to the wrong vendor).
// Phase 5 wiring or Phase 3 may add them; the interface and registry stay ready.
export const openaiAdapter: LlmAdapter = {
  name: 'openai',
  async chat() {
    throw new Error('openai adapter not configured; set agent.llm_provider=anthropic in /admin/settings for Phase 2.');
  },
};

export const geminiAdapter: LlmAdapter = {
  name: 'gemini',
  async chat() {
    throw new Error('gemini adapter not configured; set agent.llm_provider=anthropic in /admin/settings for Phase 2.');
  },
};
