// Enforced guards (§7): per-session message cap, daily global budget, kill
// switch, input length cap. Each guard is enforced in code, not in the prompt.

import type { Db } from '@mohith-das/portfolio-db';
import { getSetting } from './settings.js';
import { dailyMessageCount } from './db.js';
import { isAgentEnabled } from './llm/index.js';

export interface LimitsConfig {
  sessionMaxMessages: number;
  dailyBudget: number;
  ipSessionsPerDay: number;
}

export function getLimits(db: Db): LimitsConfig {
  const num = (k: string, fallback: number) => {
    const v = Number(getSetting(db, k) ?? '');
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
  return {
    sessionMaxMessages: num('limits.session_max_messages', 40),
    dailyBudget:        num('limits.daily_message_budget', 500),
    ipSessionsPerDay:   num('limits.ip_sessions_per_day', 20),
  };
}

export interface GuardResult {
  allowed: boolean;
  reason?: string;
}

export function checkPreTurnGuards(db: Db, messageCount: number, inputLen: number): GuardResult {
  if (!isAgentEnabled(db)) return { allowed: false, reason: 'agent_disabled' };
  const L = getLimits(db);
  if (inputLen > 4000) return { allowed: false, reason: 'input_too_long' };
  if (messageCount >= L.sessionMaxMessages) return { allowed: false, reason: 'session_message_cap' };
  const used = dailyMessageCount(db);
  if (used >= L.dailyBudget) return { allowed: false, reason: 'daily_message_budget' };
  return { allowed: true };
}
