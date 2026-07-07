import type Database from 'better-sqlite3';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// migrations/ lives at the package root (next to src/). This resolves correctly
// whether the package is consumed from source (vitest/tsx) or compiled (dist/
// would sit one level down too, so ../migrations still points at the same dir).
const MIGRATIONS_DIR = resolve(here, '..', 'migrations');

export function ensureMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name        TEXT PRIMARY KEY,
      applied_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

// Apply pending `.sql` migrations in lexical order. Each migration runs inside
// BEGIN IMMEDIATE so two processes sharing the DB file (web + orchestrator)
// cannot both apply the same migration: the second waits on busy_timeout, then
// sees the row in _migrations and skips. Mirrors jobops's db.ts pattern, hardened
// for the multi-process topology in §3.
export function applyPendingMigrations(db: Database.Database): void {
  ensureMigrationsTable(db);
  let files: string[];
  try {
    files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  } catch (err) {
    throw new Error(`Could not read migrations dir at ${MIGRATIONS_DIR}: ${(err as Error).message}`);
  }
  const seen = db.prepare<[string], { name: string }>('SELECT name FROM _migrations WHERE name = ?');
  for (const file of files) {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (seen.get(file) !== undefined) {
        db.exec('COMMIT');
        continue;
      }
      const sql = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf-8');
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
      db.exec('COMMIT');
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // Transaction may already be closed if BEGIN itself failed; ignore.
      }
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    }
  }
}
