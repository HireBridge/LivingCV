// Local settings helpers for the orchestrator. The web app has the same
// helpers (apps/web/src/lib/settings.ts) but the orchestrator is its own
// process with its own DB handle and can't import from the web. The shape and
// semantics match — keep them in sync.

import type { Db } from '@livingcv/db';
import { decrypt, encrypt, maskSecret, generateEncryptionKey } from '@livingcv/crypto';
import { ENCRYPTED_SETTING_KEYS, SETTING_KEYS } from '@livingcv/shared';

const BOOTSTRAP_KEY = 'bootstrap.encryption_key';

export function getEncryptionKey(db: Db): string {
  const fromEnv = process.env.PORTFOLIO_ENCRYPTION_KEY;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  const row = db
    .prepare<[string], { value: string }>('SELECT value FROM app_settings WHERE key = ?')
    .get(BOOTSTRAP_KEY);
  if (row && row.value) return row.value;
  throw new Error(
    'No encryption key available. Set PORTFOLIO_ENCRYPTION_KEY or run the setup wizard.',
  );
}

export function getSetting(db: Db, key: string): string | null {
  const row = db
    .prepare<[string], { value: string; encrypted: number }>(
      'SELECT value, encrypted FROM app_settings WHERE key = ?',
    )
    .get(key);
  if (!row) return null;
  if (row.encrypted === 1) return decrypt(row.value, getEncryptionKey(db));
  return row.value;
}

export function setSetting(db: Db, key: string, value: string): void {
  const now = new Date().toISOString();
  const encrypted = ENCRYPTED_SETTING_KEYS.has(key) ? 1 : 0;
  const stored = encrypted === 1 ? encrypt(value, getEncryptionKey(db)) : value;
  void stored;
  db.prepare(
    'INSERT OR REPLACE INTO app_settings (key, value, encrypted, updated_at) VALUES (?, ?, ?, ?)',
  ).run(key, stored, encrypted, now);
}

export function ensureEncryptionKey(db: Db): string {
  const fromEnv = process.env.PORTFOLIO_ENCRYPTION_KEY;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  const existing = db
    .prepare<[string], { value: string }>('SELECT value FROM app_settings WHERE key = ?')
    .get(BOOTSTRAP_KEY);
  if (existing && existing.value) return existing.value;
  const key = generateEncryptionKey();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT OR REPLACE INTO app_settings (key, value, encrypted, updated_at) VALUES (?, ?, 0, ?)',
  ).run(BOOTSTRAP_KEY, key, now);
  return key;
}

export function isSetupComplete(db: Db): boolean {
  const row = db
    .prepare<[string], { value: string }>('SELECT value FROM app_settings WHERE key = ?')
    .get(SETTING_KEYS.setupComplete);
  return row?.value === '1';
}

export function getSettingForBrowser(db: Db, key: string): string {
  const row = db
    .prepare<[string], { value: string; encrypted: number }>(
      'SELECT value, encrypted FROM app_settings WHERE key = ?',
    )
    .get(key);
  if (!row) return '';
  if (row.encrypted === 1) {
    try {
      return maskSecret(decrypt(row.value, getEncryptionKey(db)));
    } catch {
      return row.value ? '••••' : '';
    }
  }
  return row.value;
}

export function getAllSettings(db: Db): Record<string, string> {
  const rows = db
    .prepare<[], { key: string; value: string; encrypted: number }>(
      'SELECT key, value, encrypted FROM app_settings',
    )
    .all();
  const out: Record<string, string> = {};
  for (const r of rows) {
    out[r.key] = r.encrypted === 1 ? decrypt(r.value, getEncryptionKey(db)) : r.value;
  }
  return out;
}
