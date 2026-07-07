import { describe, it, expect, afterAll } from 'vitest';
import { openDb, runInWriteLock } from '../src/index.js';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const expectedMigrations = readdirSync(join(__dirname, '../migrations')).filter(f => f.endsWith('.sql')).length + 1;

const dir = mkdtempSync(join(tmpdir(), 'portfolio-db-'));
const dbPath = join(dir, 'test.db');

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const ALL_TABLES = [
  'app_settings',
  'templates',
  'site_content',
  'projects',
  'case_studies',
  'recruiter_sessions',
  'chat_messages',
  'disposable_domains',
  'page_views',
  '_migrations',
] as const;

describe('openDb + migrations', () => {
  it('creates all §6 tables on a fresh DB', () => {
    const db = openDb(dbPath);
    const rows = db
      .prepare<[], { name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all();
    const names = rows.map((r) => r.name);
    for (const t of ALL_TABLES) {
      expect(names).toContain(t);
    }
    db.close();
  });

  it('seeds disposable_domains from the built-in list', () => {
    const db = openDb(dbPath);
    const { n } = db.prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM disposable_domains').get()!;
    expect(n).toBeGreaterThan(30);
    const gmail = db
      .prepare<[string], { domain: string }>('SELECT domain FROM disposable_domains WHERE domain = ?')
      .get('gmail.com');
    expect(gmail).toBeDefined();
    const { builtin } = db
      .prepare<[], { builtin: number }>("SELECT COUNT(*) AS builtin FROM disposable_domains WHERE source = 'builtin'")
      .get()!;
    expect(builtin).toBe(n); // all seeded rows are builtin
    db.close();
  });

  it('is idempotent — reopening does not duplicate seeds or error', () => {
    const db1 = openDb(dbPath);
    const { n: before } = db1.prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM disposable_domains').get()!;
    db1.close();

    const db2 = openDb(dbPath);
    const { n: after } = db2.prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM disposable_domains').get()!;
    expect(after).toBe(before);

    const { m } = db2.prepare<[], { m: number }>('SELECT COUNT(*) AS m FROM _migrations').get()!;
    // all sql migrations + seed:disposable_domains
    expect(m).toBe(expectedMigrations);
    db2.close();
  });

  it('sets WAL + busy_timeout + foreign_keys pragmas', () => {
    const db = openDb(dbPath);
    const journal = (db.pragma('journal_mode') as { journal_mode: string }[])[0]?.journal_mode;
    expect(journal?.toLowerCase()).toBe('wal');
    // SQLite exposes the busy timeout under the "timeout" column.
    const bt = (db.pragma('busy_timeout') as { timeout: number }[])[0]?.timeout;
    expect(bt).toBe(5000);
    const fk = (db.pragma('foreign_keys') as { foreign_keys: number }[])[0]?.foreign_keys;
    expect(fk).toBe(1);
    db.close();
  });

  it('two connections on the same file both see the schema without double-applying', () => {
    const freshDir = mkdtempSync(join(tmpdir(), 'portfolio-db-2-'));
    const freshPath = join(freshDir, 'two.db');
    try {
      const a = openDb(freshPath);
      const b = openDb(freshPath);
      const { m } = b.prepare<[], { m: number }>('SELECT COUNT(*) AS m FROM _migrations').get()!;
      expect(m).toBe(expectedMigrations);
      a.close();
      b.close();
    } finally {
      rmSync(freshDir, { recursive: true, force: true });
    }
  });

  it('runInWriteLock serializes writes and never deadlocks on a thrown task', async () => {
    const db = openDb(dbPath);
    const order: string[] = [];
    const p1 = runInWriteLock(() => {
      order.push('a');
      return Promise.resolve(1);
    });
    const p2 = runInWriteLock(() => {
      order.push('b');
      throw new Error('boom');
    });
    const p3 = runInWriteLock(() => {
      order.push('c');
      return Promise.resolve(3);
    });
    await expect(p2).rejects.toThrow('boom');
    await Promise.all([p1, p3]);
    expect(order).toEqual(['a', 'b', 'c']);
    db.close();
  });
});
