// Regression: the admin blog save route used to drop the `tags` field — the
// form sent it, the route never read it, and `upsertBlog` defaulted tags to ''.
// After the fix, saving through the admin UI must preserve whatever tags the
// operator typed.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type Db } from '@livingcv/db';
import crypto from 'node:crypto';

let db: Db;
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'admin-blog-save-'));
  process.env.DATA_DIR = dir;
  process.env.PORTFOLIO_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
  // Reset the global DB cache so getDb() in the route re-opens against DATA_DIR.
  delete (globalThis as { __portfolioDb?: Db }).__portfolioDb;
  db = openDb(join(dir, 'test.db'));
  (globalThis as { __portfolioDb?: Db }).__portfolioDb = db;
});

afterEach(() => {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
});

function makeSaveRequest(fields: Record<string, string>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return new Request('http://localhost/api/admin/blogs/save', { method: 'POST', body: form });
}

describe('POST /api/admin/blogs/save — tags preservation (regression)', () => {
  it('persists the tags submitted by the form (insert path)', async () => {
    const { POST } = await import('../src/app/api/admin/blogs/save/route');
    const res = await POST(makeSaveRequest({
      slug: 'hello',
      title: 'Hello',
      summary: 'sum',
      body_markdown: 'body',
      tags: 'react, nextjs, ai',
      published: '1',
    }));
    expect(res.status).toBe(303);

    const row = db.prepare('SELECT * FROM blogs WHERE slug = ?').get('hello') as { tags: string };
    expect(row.tags).toBe('react, nextjs, ai');
  });

  it('preserves existing tags on update when the form re-submits them', async () => {
    // Seed an existing post with tags.
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO blogs (slug, title, summary, body_markdown, published, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('hello', 'Old Title', 'sum', 'body', 1, 'keep, these', now, now);

    const { POST } = await import('../src/app/api/admin/blogs/save/route');
    const res = await POST(makeSaveRequest({
      id: '1',
      slug: 'hello',
      title: 'New Title',
      summary: 'sum',
      body_markdown: 'body',
      tags: 'keep, these',
      published: '1',
    }));
    expect(res.status).toBe(303);

    const row = db.prepare('SELECT title, tags FROM blogs WHERE slug = ?').get('hello') as { title: string; tags: string };
    expect(row.title).toBe('New Title');
    expect(row.tags).toBe('keep, these');
  });

  it('allows the operator to clear tags by submitting an empty string', async () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO blogs (slug, title, summary, body_markdown, published, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('hello', 'T', '', '', 1, 'old, tags', now, now);

    const { POST } = await import('../src/app/api/admin/blogs/save/route');
    await POST(makeSaveRequest({
      id: '1',
      slug: 'hello',
      title: 'T',
      summary: '',
      body_markdown: '',
      tags: '',
      published: '0',
    }));

    const row = db.prepare('SELECT tags FROM blogs WHERE slug = ?').get('hello') as { tags: string };
    expect(row.tags).toBe('');
  });
});