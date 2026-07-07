import { getSetting } from '../settings.js';
import { LlmProvider, LLM_PROVIDERS } from '@livingcv/shared';
import type { Db } from '@livingcv/db';
import { anthropicAdapter } from './anthropic.js';
import { openaiAdapter, geminiAdapter } from './openai.js';
import type { LlmAdapter } from './types.js';

// Dispatch by provider. Provider+key+model are read from app_settings at
// session start (§7). If the provider block is missing, the orchestrator
// refuses to serve /api/chat/message with a clear 503.

export function getLlmConfig(db: Db): {
  provider: LlmProvider;
  adapter: LlmAdapter;
  apiKey: string;
  model: string;
} | null {
  const providerRaw = String(getSetting(db, 'agent.llm_provider') ?? '').trim().toLowerCase();
  if (!LLM_PROVIDERS.includes(providerRaw as LlmProvider)) return null;
  const provider = providerRaw as LlmProvider;
  const apiKey = getSetting(db, 'agent.llm_api_key') ?? '';
  const model = String(getSetting(db, 'agent.llm_model') ?? defaultModelFor(provider)).trim();
  const adapter: LlmAdapter =
    provider === 'anthropic' ? anthropicAdapter
    : provider === 'openai' ? openaiAdapter
    : geminiAdapter;
  return { provider, adapter, apiKey, model };
}

function defaultModelFor(provider: LlmProvider): string {
  switch (provider) {
    case 'anthropic': return 'claude-sonnet-4-5';
    case 'openai':    return 'gpt-4o-mini';
    case 'gemini':    return 'gemini-1.5-flash';
  }
}

export function isAgentEnabled(db: Db): boolean {
  return (String(getSetting(db, 'agent.enabled') ?? '1').trim() || '1') === '1';
}
