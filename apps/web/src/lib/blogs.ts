import type { Db } from '@livingcv/db';

export interface BlogRow {
  id: number;
  slug: string;
  title: string;
  summary: string;
  body_markdown: string;
  published: number;
  tags: string;
  created_at: string;
  updated_at: string;
}

export function listBlogs(db: Db, publishedOnly = false): BlogRow[] {
  let query = 'SELECT * FROM blogs';
  if (publishedOnly) {
    query += ' WHERE published = 1';
  }
  query += ' ORDER BY created_at DESC';
  return db.prepare<[], BlogRow>(query).all();
}

export function getBlogById(db: Db, id: number): BlogRow | null {
  return db.prepare<[number], BlogRow>('SELECT * FROM blogs WHERE id = ?').get(id) ?? null;
}

export function getBlogBySlug(db: Db, slug: string): BlogRow | null {
  return db.prepare<[string], BlogRow>('SELECT * FROM blogs WHERE slug = ?').get(slug) ?? null;
}

export function upsertBlog(db: Db, fields: { id?: number; slug: string; title: string; summary: string; body_markdown: string; published: number; tags?: string }): number {
  const now = new Date().toISOString();
  const tags = fields.tags ?? '';
  if (fields.id) {
    db.prepare(`UPDATE blogs SET slug = ?, title = ?, summary = ?, body_markdown = ?, published = ?, tags = ?, updated_at = ? WHERE id = ?`)
      .run(fields.slug, fields.title, fields.summary, fields.body_markdown, fields.published, tags, now, fields.id);
    return fields.id;
  } else {
    const r = db.prepare(`INSERT INTO blogs (slug, title, summary, body_markdown, published, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(fields.slug, fields.title, fields.summary, fields.body_markdown, fields.published, tags, now, now);
    return Number(r.lastInsertRowid);
  }
}

export function deleteBlog(db: Db, id: number) {
  db.prepare('DELETE FROM blogs WHERE id = ?').run(id);
}
