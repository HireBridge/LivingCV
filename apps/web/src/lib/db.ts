import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { openDb, type Db } from '@livingcv/db';

// Where portfolio.db and uploaded files live. In docker this is the
// portfolio-data volume mount (default /data). Local dev defaults to ./data.
export function getDataDir(): string {
  return resolve(process.env.DATA_DIR || './data');
}

export function getDbPath(): string {
  return join(getDataDir(), 'portfolio.db');
}

// One connection per process, cached on globalThis so Next.js dev HMR doesn't
// open a new handle on every reload. Both this web process and the orchestrator
// (Phase 2) open the same file; WAL + busy_timeout keep them safe.
const GLOBAL = globalThis as unknown as { __portfolioDb?: Db };

export function getDb(): Db {
  if (!GLOBAL.__portfolioDb) {
    mkdirSync(getDataDir(), { recursive: true });
    GLOBAL.__portfolioDb = openDb(getDbPath());
  }
  return GLOBAL.__portfolioDb;
}
