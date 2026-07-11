// Tests for the three new master-MCP blog tools (publish / update / list).
// Pattern: stand up a real SQLite DB in mkdtempSync (matches behavioral.test.ts),
// then drive the handlers exported from masterMcp.ts. getDb() in masterMcp.ts
// reads from the shared globalThis cache; we mock it to point at the test DB so
// the handlers read/write the same rows the helpers are tested against.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type Db } from '@livingcv/db';

const { testDb } = vi.hoisted(() => ({ testDb: { current: null as Db | null } }));

vi.mock('../src/db.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db.js')>();
  return {
    ...actual,
    getDb: () => {
      if (!testDb.current) throw new Error('test DB not initialized');
      return testDb.current;
    },
  };
});

let db: Db;
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'orch-blog-tools-'));
  db = openDb(join(dir, 'test.db'));
  testDb.current = db;
});

afterEach(() => {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  testDb.current = null;
});

async function importHandlers() {
  return await import('../src/masterMcp.js');
}

// ── db.ts helpers (the storage primitives the handlers are built on) ────────

describe('blog helpers in db.ts', () => {
  it('insertBlog persists the row and returns the new id', async () => {
    const { insertBlog, getBlogBySlug } = await import('../src/db.js');
    const id = insertBlog(db, {
      slug: 'hello-world',
      title: 'Hello World',
      summary: 'greetings',
      body_markdown: '# hi',
      tags: 'intro, meta',
      published: 1,
    });
    expect(id).toBeGreaterThan(0);
    const row = getBlogBySlug(db, 'hello-world');
    expect(row).not.toBeNull();
    expect(row!.title).toBe('Hello World');
    expect(row!.tags).toBe('intro, meta');
    expect(row!.published).toBe(1);
  });

  it('updateBlogBySlugOrId leaves unspecified fields untouched (especially tags)', async () => {
    const { insertBlog, updateBlogBySlugOrId, getBlogBySlug } = await import('../src/db.js');
    insertBlog(db, {
      slug: 'a-post',
      title: 'A Post',
      summary: 'sum',
      body_markdown: 'body',
      tags: 'keep-me, please',
      published: 1,
    });
    const changes = updateBlogBySlugOrId(db, { slug: 'a-post' }, { title: 'A Post (edited)' });
    expect(changes).toBe(1);
    const row = getBlogBySlug(db, 'a-post')!;
    expect(row.title).toBe('A Post (edited)');
    // The critical assertion: tags survived.
    expect(row.tags).toBe('keep-me, please');
    expect(row.summary).toBe('sum');
    expect(row.body_markdown).toBe('body');
    expect(row.published).toBe(1);
  });

  it('updateBlogBySlugOrId can rename via new_slug', async () => {
    const { insertBlog, updateBlogBySlugOrId, getBlogBySlug } = await import('../src/db.js');
    insertBlog(db, { slug: 'old', title: 'T', summary: '', body_markdown: '', tags: '', published: 0 });
    updateBlogBySlugOrId(db, { slug: 'old' }, { new_slug: 'new' });
    expect(getBlogBySlug(db, 'old')).toBeNull();
    expect(getBlogBySlug(db, 'new')).not.toBeNull();
  });

  it('updateBlogBySlugOrId returns 0 when the locator matches nothing', async () => {
    const { updateBlogBySlugOrId } = await import('../src/db.js');
    expect(updateBlogBySlugOrId(db, { slug: 'nope' }, { title: 'X' })).toBe(0);
  });

  it('listBlogPosts excludes the body and orders newest first', async () => {
    const { insertBlog, listBlogPosts } = await import('../src/db.js');
    insertBlog(db, { slug: 'a', title: 'A', summary: '', body_markdown: 'AAAA', tags: '', published: 1 });
    // Force created_at to differ so ordering is deterministic.
    db.prepare("UPDATE blogs SET created_at = '2020-01-01T00:00:00Z' WHERE slug = 'a'").run();
    insertBlog(db, { slug: 'b', title: 'B', summary: '', body_markdown: 'BBBB', tags: '', published: 0 });
    db.prepare("UPDATE blogs SET created_at = '2026-01-01T00:00:00Z' WHERE slug = 'b'").run();

    const all = listBlogPosts(db);
    expect(all.map((r) => r.slug)).toEqual(['b', 'a']);
    // body_markdown is not in the list shape.
    expect(all[0]).not.toHaveProperty('body_markdown');

    const published = listBlogPosts(db, true);
    expect(published.map((r) => r.slug)).toEqual(['a']);
  });
});

// ── masterMcp tool handlers ─────────────────────────────────────────────────

describe('publish_blog_post', () => {
  it('publishes a happy-path post: defaults applied, tags joined, public URL returned', async () => {
    const { handlePublishBlogPost } = await importHandlers();
    const { getBlogBySlug } = await import('../src/db.js');

    const res = handlePublishBlogPost({
      title: 'Hello World',
      body_markdown: '# hi',
      tags: ['react', 'nextjs'],
    });
    expect(res.isError).toBeUndefined();
    const text = (res.content[0] as { text: string }).text;
    expect(text).toContain('published (live on /blog/hello-world)');
    expect(text).toContain('url=/blog/hello-world');

    const row = getBlogBySlug(db, 'hello-world')!;
    expect(row.tags).toBe('react, nextjs');
    expect(row.published).toBe(1); // default true
    expect(row.summary).toBe(''); // default ''
  });

  it('auto-generates a kebab-case slug from the title', async () => {
    const { handlePublishBlogPost } = await importHandlers();
    const { getBlogBySlug } = await import('../src/db.js');

    handlePublishBlogPost({ title: 'My First Post!!! With Spaces', body_markdown: 'x' });
    expect(getBlogBySlug(db, 'my-first-post-with-spaces')).not.toBeNull();
  });

  it('rejects a colliding explicit slug and points at update_blog_post', async () => {
    const { handlePublishBlogPost } = await importHandlers();
    const { insertBlog } = await import('../src/db.js');
    insertBlog(db, { slug: 'taken', title: 'T', summary: '', body_markdown: '', tags: '', published: 1 });

    const res = handlePublishBlogPost({ title: 'Anything', body_markdown: 'x', slug: 'taken' });
    expect(res.isError).toBe(true);
    const text = (res.content[0] as { text: string }).text;
    expect(text).toContain('Slug "taken" is already in use');
    expect(text).toContain('update_blog_post');
  });

  it('falls back to -2 / -3 when the auto-generated slug is taken', async () => {
    const { handlePublishBlogPost } = await importHandlers();
    const { insertBlog, getBlogBySlug } = await import('../src/db.js');
    insertBlog(db, { slug: 'hello-world', title: 'T', summary: '', body_markdown: '', tags: '', published: 1 });

    const res = handlePublishBlogPost({ title: 'Hello World', body_markdown: 'x' });
    expect(res.isError).toBeUndefined();
    expect(getBlogBySlug(db, 'hello-world-2')).not.toBeNull();
  });

  it('rejects missing title with a clear message', async () => {
    const { handlePublishBlogPost } = await importHandlers();
    const res = handlePublishBlogPost({ body_markdown: 'x' });
    expect(res.isError).toBe(true);
    expect((res.content[0] as { text: string }).text).toMatch(/title/);
  });

  it('rejects missing body_markdown with a clear message', async () => {
    const { handlePublishBlogPost } = await importHandlers();
    const res = handlePublishBlogPost({ title: 'X' });
    expect(res.isError).toBe(true);
    expect((res.content[0] as { text: string }).text).toMatch(/body_markdown/);
  });

  it('saves as a draft when published: false', async () => {
    const { handlePublishBlogPost } = await importHandlers();
    const { getBlogBySlug } = await import('../src/db.js');

    const res = handlePublishBlogPost({ title: 'Draft', body_markdown: 'x', published: false });
    const text = (res.content[0] as { text: string }).text;
    expect(text).toContain('saved as draft');
    expect(getBlogBySlug(db, 'draft')!.published).toBe(0);
  });
});

describe('update_blog_post', () => {
  it('partially updates a post: title changes, tags untouched, updated_at advances', async () => {
    const { handleUpdateBlogPost } = await importHandlers();
    const { insertBlog, getBlogBySlug } = await import('../src/db.js');
    insertBlog(db, {
      slug: 'post',
      title: 'Old',
      summary: 'sum',
      body_markdown: 'body',
      tags: 'react, ai',
      published: 1,
    });
    db.prepare("UPDATE blogs SET updated_at = '2020-01-01T00:00:00Z' WHERE slug = 'post'").run();

    const res = handleUpdateBlogPost({ slug: 'post', title: 'New' });
    expect(res.isError).toBeUndefined();

    const row = getBlogBySlug(db, 'post')!;
    expect(row.title).toBe('New');
    expect(row.tags).toBe('react, ai'); // preserved
    expect(row.summary).toBe('sum'); // preserved
    expect(row.published).toBe(1); // preserved
    // updated_at moved off the 2020 stamp.
    expect(new Date(row.updated_at).getTime()).toBeGreaterThan(new Date('2020-01-01').getTime());
  });

  it('updates tags when the caller passes a tags array (joined with ", ")', async () => {
    const { handleUpdateBlogPost } = await importHandlers();
    const { insertBlog, getBlogBySlug } = await import('../src/db.js');
    insertBlog(db, { slug: 'post', title: 'T', summary: '', body_markdown: '', tags: 'old', published: 1 });

    handleUpdateBlogPost({ slug: 'post', tags: ['new', 'fresh'] });
    expect(getBlogBySlug(db, 'post')!.tags).toBe('new, fresh');
  });

  it('returns an error when the locator matches nothing', async () => {
    const { handleUpdateBlogPost } = await importHandlers();
    const res = handleUpdateBlogPost({ slug: 'nope', title: 'X' });
    expect(res.isError).toBe(true);
    expect((res.content[0] as { text: string }).text).toMatch(/No blog post matched/);
  });

  it('returns an error when neither slug nor id is provided', async () => {
    const { handleUpdateBlogPost } = await importHandlers();
    const res = handleUpdateBlogPost({ title: 'X' });
    expect(res.isError).toBe(true);
    expect((res.content[0] as { text: string }).text).toMatch(/slug or id/);
  });

  it('returns the merged row so the caller can see post-update state', async () => {
    const { handleUpdateBlogPost } = await importHandlers();
    const { insertBlog } = await import('../src/db.js');
    insertBlog(db, { slug: 'post', title: 'Old', summary: '', body_markdown: '', tags: '', published: 1 });

    const res = handleUpdateBlogPost({ slug: 'post', title: 'New' });
    const text = (res.content[0] as { text: string }).text;
    const parsed = JSON.parse(text);
    expect(parsed.title).toBe('New');
    expect(parsed.slug).toBe('post');
  });
});

describe('list_blog_posts', () => {
  it('returns the metadata list as pretty JSON', async () => {
    const { handleListBlogPosts } = await importHandlers();
    const { insertBlog } = await import('../src/db.js');
    insertBlog(db, { slug: 'a', title: 'A', summary: '', body_markdown: 'AAAA', tags: '', published: 1 });
    insertBlog(db, { slug: 'b', title: 'B', summary: '', body_markdown: 'BBBB', tags: '', published: 0 });

    const res = handleListBlogPosts({});
    expect(res.isError).toBeUndefined();
    const rows = JSON.parse((res.content[0] as { text: string }).text);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.map((r: { slug: string }) => r.slug)).toEqual(['b', 'a']);
    // list output strips body_markdown.
    expect(rows[0]).not.toHaveProperty('body_markdown');
  });

  it('honors published_only to skip drafts', async () => {
    const { handleListBlogPosts } = await importHandlers();
    const { insertBlog } = await import('../src/db.js');
    insertBlog(db, { slug: 'live', title: 'L', summary: '', body_markdown: '', tags: '', published: 1 });
    insertBlog(db, { slug: 'draft', title: 'D', summary: '', body_markdown: '', tags: '', published: 0 });

    const rows = JSON.parse((handleListBlogPosts({ published_only: true }).content[0] as { text: string }).text);
    expect(rows.map((r: { slug: string }) => r.slug)).toEqual(['live']);
  });
});

describe('SQL_TOOL_DESCRIPTION documents the blogs table', () => {
  it('names every column and warns about MDX braces', () => {
    const src = readFileSync(
      join(process.cwd(), 'apps', 'orchestrator', 'src', 'masterMcp.ts'),
      'utf8',
    );
    // The blog helpers exist in source — they're the documented contract.
    expect(src).toMatch(/BLOGS TABLE:/);
    expect(src).toContain('blogs(id, slug UNIQUE, title, summary, body_markdown, published, tags, created_at, updated_at)');
    expect(src).toMatch(/comma-separated/);
    expect(src).toMatch(/MDX/);
    expect(src).toMatch(/publish_blog_post/);
  });
});