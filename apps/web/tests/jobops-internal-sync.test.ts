import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type Db } from '@livingcv/db';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

let db: Db;
let dir: string;
const secret = 'integration-test-service-secret';
const packet = {
  identity: { fullName: 'Scheduled Candidate', githubUrl: 'https://github.com/candidate' },
  taglines: [{ archetype: 'default', text: 'AI engineer' }],
  summary: 'Approved synchronized profile.',
  projects: [{ slug: 'new-public-repo', name: 'New Public Repo', tagline: 'Found by the six-hour scan', url: 'https://github.com/candidate/new-public-repo' }],
  skills: [{ name: 'TypeScript' }], experience: [], education: [], version: '2',
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'livingcv-internal-sync-'));
  process.env.DATA_DIR = dir;
  process.env.JOBOPS_INTERNAL_SYNC_SECRET = secret;
  delete (globalThis as { __portfolioDb?: Db }).__portfolioDb;
  db = openDb(join(dir, 'portfolio.db'));
  (globalThis as { __portfolioDb?: Db }).__portfolioDb = db;
});

afterEach(() => {
  delete process.env.JOBOPS_INTERNAL_SYNC_SECRET;
  delete (globalThis as { __portfolioDb?: Db }).__portfolioDb;
  rmSync(dir, { recursive: true, force: true });
});

function request(auth: string, approved = true) {
  return new Request('http://localhost/api/internal/jobops-sync', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-jobops-sync-secret': auth },
    body: JSON.stringify({ packet, approved_by_user: approved, proposal_id: approved ? 'github-proposal-1' : undefined }),
  });
}

describe('integrated JobOps → LivingCV sync', () => {
  it('rejects unprovisioned callers', async () => {
    const { POST } = await import('../src/app/api/internal/jobops-sync/route');
    expect((await POST(request('wrong-secret'))).status).toBe(401);
  });

  it('stores the packet and publishes it after the unified user approval', async () => {
    const { POST } = await import('../src/app/api/internal/jobops-sync/route');
    const response = await POST(request(secret));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ stored: true, approved: true, published: 4 });

    const stored = db.prepare("SELECT value, source FROM synced_state WHERE key = 'career_packet'").get() as { value: string; source: string };
    expect(stored.source).toBe('jobops');
    expect(JSON.parse(stored.value).identity.fullName).toBe('Scheduled Candidate');
    expect(db.prepare('SELECT title, repo_url FROM projects WHERE slug = ?').get('new-public-repo')).toEqual({
      title: 'New Public Repo', repo_url: 'https://github.com/candidate/new-public-repo',
    });
    const hero = db.prepare("SELECT content FROM site_content WHERE section_key = 'hero' ORDER BY id DESC LIMIT 1").get() as { content: string };
    expect(JSON.parse(hero.content).name).toBe('Scheduled Candidate');
    expect(db.prepare("SELECT value FROM synced_state WHERE key = 'career_packet_last_approval'").get()).toBeTruthy();
  });

  it('stores an unapproved packet without modifying the public portfolio', async () => {
    const { POST } = await import('../src/app/api/internal/jobops-sync/route');
    const response = await POST(request(secret, false));
    expect(await response.json()).toMatchObject({ stored: true, approved: false, published: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM projects').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM site_content').get()).toEqual({ n: 0 });
  });
});
