import type Database from 'better-sqlite3';
import { FREE_EMAIL_DOMAINS } from '@livingcv/shared';

// Seed the built-in disposable-domain denylist into `disposable_domains` once,
// tracked in `_migrations` under 'seed:disposable_domains' so it is idempotent
// across processes and across reopens. The list itself lives in
// @livingcv/shared/free-email-domains so it is auditable in one place (§6).
export function seedDisposableDomains(db: Database.Database): void {
  db.exec('BEGIN IMMEDIATE');
  try {
    const seen = db
      .prepare<[string], { name: string }>('SELECT name FROM _migrations WHERE name = ?')
      .get('seed:disposable_domains');
    if (seen !== undefined) {
      db.exec('COMMIT');
      return;
    }
    const insert = db.prepare(
      'INSERT OR IGNORE INTO disposable_domains (domain, source, added_at) VALUES (?, ?, ?)',
    );
    const now = new Date().toISOString();
    for (const domain of FREE_EMAIL_DOMAINS) {
      insert.run(domain, 'builtin', now);
    }
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run('seed:disposable_domains');
    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // Transaction may already be closed; ignore.
    }
    throw err;
  }
}
