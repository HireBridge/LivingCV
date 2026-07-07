import Database from 'better-sqlite3';
import { applyPendingMigrations } from './migrate.js';
import { seedDisposableDomains } from './seed.js';

export { applyPendingMigrations } from './migrate.js';
export { seedDisposableDomains } from './seed.js';

// Instance type alias so callers don't have to import better-sqlite3's namespace
// shape directly.
export type Db = Database.Database;

export interface OpenDbOptions {
  /** Skip running migrations + the built-in seed on open (caller manages them). */
  skipMigrate?: boolean;
}

// Open the portfolio SQLite database. WAL + foreign_keys + synchronous=NORMAL
// mirror jobops; busy_timeout=5000 lets a second process (web + orchestrator
// share this file) wait briefly instead of failing with SQLITE_BUSY. Writes
// from callers must go through runInWriteLock() within a process and through
// short immediate transactions across processes (§3, §14 risk 6).
export function openDb(path: string, opts: OpenDbOptions = {}): Database.Database {
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 5000');
  if (!opts.skipMigrate) {
    applyPendingMigrations(db);
    seedDisposableDomains(db);
  }
  return db;
}

// Single in-process write lock — serializes mutations so they don't interleave.
// Cross-process safety comes from WAL + busy_timeout + short immediate
// transactions; this queue only orders writes within this process. Mirrors
// jobops's runInWriteLock.
let writeQueue: Promise<unknown> = Promise.resolve();

export function runInWriteLock<T>(fn: () => T | Promise<T>): Promise<T> {
  const next = writeQueue.then(() => fn());
  // Keep the chain alive even if a task throws — failures must not deadlock the queue.
  writeQueue = next.catch(() => undefined);
  return next as Promise<T>;
}
