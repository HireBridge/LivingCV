import type { Db } from '@livingcv/db';
import type { CareerPacket } from '@livingcv/shared';

export function getSyncedCareerPacket(db: Db): CareerPacket | null {
  const row = db.prepare<[string], { value: string }>(
    'SELECT value FROM synced_state WHERE key = ?',
  ).get('career_packet');
  if (!row) return null;
  try {
    return JSON.parse(row.value) as CareerPacket;
  } catch {
    return null;
  }
}

export function hasSyncedState(db: Db, key: string): boolean {
  const row = db.prepare<[string], { n: number }>(
    'SELECT COUNT(*) AS n FROM synced_state WHERE key = ?',
  ).get(key);
  return (row?.n ?? 0) > 0;
}
