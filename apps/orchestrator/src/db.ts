// Tiny DB layer for the orchestrator (§7). Same connection policy as the web
// app: single connection per process, WAL + busy_timeout (set by @livingcv/db's
// openDb). Both this process and the web process open the same portfolio.db;
// multi-process safety comes from @livingcv/db's pragmas + runInWriteLock.

import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { openDb, type Db } from '@livingcv/db';

const DATA_DIR = resolve(process.env.DATA_DIR || './data');
const DB_PATH = join(DATA_DIR, 'portfolio.db');

const GLOBAL = globalThis as unknown as { __orchestratorDb?: Db };

export function getDb(): Db {
  if (!GLOBAL.__orchestratorDb) {
    mkdirSync(DATA_DIR, { recursive: true });
    GLOBAL.__orchestratorDb = openDb(DB_PATH);
  }
  return GLOBAL.__orchestratorDb;
}

// ── projects / case studies (local tools) ───────────────────────────────────

export interface ProjectRow {
  id: number;
  slug: string;
  title: string;
  tagline: string | null;
  featured: number;
}

export function listFeaturedProjects(db: Db): ProjectRow[] {
  return db
    .prepare<[], ProjectRow>(
      'SELECT id, slug, title, tagline, featured FROM projects WHERE featured = 1 ORDER BY COALESCE(sort_order, id)',
    )
    .all();
}

export function getProjectBySlug(db: Db, slug: string): ProjectRow | null {
  const row = db.prepare<[string], ProjectRow>('SELECT id, slug, title, tagline, featured FROM projects WHERE slug = ?').get(slug);
  return row ?? null;
}

export interface CaseStudyLite {
  slug: string;
  project_slug: string;
  frontmatter: string | null;
  body_markdown: string | null;
  published: number;
}

export function getCaseStudyForTool(db: Db, projectSlug: string): CaseStudyLite | null {
  const row = db
    .prepare<[string, number], CaseStudyLite>(
      `SELECT cs.slug AS slug, p.slug AS project_slug, cs.frontmatter, cs.body_markdown, cs.published
       FROM case_studies cs JOIN projects p ON p.id = cs.project_id
       WHERE p.slug = ? AND cs.published = 1
       LIMIT 1`,
    )
    .get(projectSlug, 1);
  return row ?? null;
}

// ── sessions + transcripts ──────────────────────────────────────────────────

export interface RecruiterSessionRow {
  id: string;
  channel: string;
  work_email: string | null;
  email_domain: string | null;
  company_domain_inferred: string | null;
  ip_hash: string | null;
  user_agent: string | null;
  started_at: string;
  last_active_at: string | null;
  email_verified: number;
  blocked_reason: string | null;
  message_count: number;
}

export function createRecruiterSession(db: Db, params: {
  id: string;
  channel: string;
  ip_hash: string | null;
  user_agent: string | null;
}): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO recruiter_sessions (id, channel, work_email, email_domain, company_domain_inferred,
      ip_hash, user_agent, started_at, last_active_at, email_verified, blocked_reason, message_count)
     VALUES (@id, @channel, '', '', '', @ip_hash, @user_agent, @now, @now, 0, '', 0)`,
  ).run({
    id: params.id,
    channel: params.channel,
    ip_hash: params.ip_hash,
    user_agent: params.user_agent,
    now,
  });
}

export function getSession(db: Db, id: string): RecruiterSessionRow | null {
  const row = db.prepare<[string], RecruiterSessionRow>('SELECT * FROM recruiter_sessions WHERE id = ?').get(id);
  return row ?? null;
}

export function setSessionEmailVerified(db: Db, id: string, workEmail: string, emailDomain: string, companyDomainInferred: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE recruiter_sessions SET work_email = @work_email, email_domain = @email_domain,
      company_domain_inferred = @company_domain, email_verified = 1, last_active_at = @now
     WHERE id = @id`,
  ).run({
    id,
    work_email: workEmail,
    email_domain: emailDomain,
    company_domain: companyDomainInferred,
    now,
  });
}

export function setSessionBlocked(db: Db, id: string, reason: string): void {
  const now = new Date().toISOString();
  db.prepare(
    'UPDATE recruiter_sessions SET blocked_reason = ?, last_active_at = ? WHERE id = ?',
  ).run(reason, now, id);
}

export function bumpSessionActivity(db: Db, id: string, incrementMessageCount: boolean): number {
  const now = new Date().toISOString();
  if (!incrementMessageCount) {
    db.prepare('UPDATE recruiter_sessions SET last_active_at = ? WHERE id = ?').run(now, id);
    return -1;
  }
  const r = db.prepare(
    'UPDATE recruiter_sessions SET last_active_at = ?, message_count = message_count + 1 WHERE id = ?',
  ).run(now, id);
  return Number(r.changes);
}

export interface RecentMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
}

export function getRecentChatMessages(db: Db, sessionId: string, limit: number): RecentMessage[] {
  const rows = db.prepare<[string, number], RecentMessage>(
    `SELECT role, content FROM chat_messages
     WHERE session_id = ? AND role IN ('user', 'assistant') AND content != ''
     ORDER BY id DESC LIMIT ?`,
  ).all(sessionId, limit);
  return rows.reverse();
}

export function dailyMessageCount(db: Db): number {
  const day = new Date().toISOString().slice(0, 10);
  const row = db.prepare<[string], { n: number }>(
    `SELECT COUNT(*) AS n FROM chat_messages
     WHERE role = 'user' AND substr(created_at, 1, 10) = ?`,
  ).get(day)!;
  return row.n;
}

export function countIpSessionsToday(db: Db, ipHash: string): number {
  const day = new Date().toISOString().slice(0, 10);
  const row = db.prepare<[string, string], { n: number }>(
    `SELECT COUNT(*) AS n FROM recruiter_sessions
     WHERE ip_hash = ? AND substr(started_at, 1, 10) = ?`,
  ).get(ipHash, day)!;
  return row.n;
}

// ── synced state (career packet, etc.) ──────────────────────────────────────
//
// The synced_state table holds externally-pushed data (e.g., a career packet
// snapshot from JobOps). Values are JSON strings; callers parse them after read.

export function upsertSyncedState(db: Db, key: string, value: string, source: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO synced_state (key, value, source, synced_at)
     VALUES (@key, @value, @source, @now)
     ON CONFLICT(key) DO UPDATE SET value = @value, source = @source, synced_at = @now`,
  ).run({ key, value, source, now });
}

export function getSyncedState(db: Db, key: string): { value: string; source: string | null; synced_at: string } | null {
  const row = db.prepare<[string], { value: string; source: string | null; synced_at: string }>(
    'SELECT value, source, synced_at FROM synced_state WHERE key = ?',
  ).get(key);
  return row ?? null;
}

export function deleteSyncedState(db: Db, key: string): void {
  db.prepare('DELETE FROM synced_state WHERE key = ?').run(key);
}

export function recordChatMessage(db: Db, params: {
  sessionId: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolName: string | null;
  toolArgs: unknown | null;
  toolResult: unknown | null;
}): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO chat_messages (session_id, role, content, tool_name, tool_args, tool_result, created_at)
     VALUES (@sid, @role, @content, @tool_name, @tool_args, @tool_result, @now)`,
  ).run({
    sid: params.sessionId,
    role: params.role,
    content: params.content,
    tool_name: params.toolName,
    tool_args: params.toolArgs == null ? null : JSON.stringify(params.toolArgs),
    tool_result: params.toolResult == null ? null : JSON.stringify(params.toolResult),
    now,
  });
}

// ── blogs (master MCP local tools) ──────────────────────────────────────────
//
// Mirrors apps/web/src/lib/blogs.ts's BlogRow, but the orchestrator's writer
// semantics differ — see insertBlog / updateBlogBySlugOrId below.

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

export interface BlogListItem {
  id: number;
  slug: string;
  title: string;
  summary: string;
  published: number;
  tags: string;
  created_at: string;
  updated_at: string;
}

export function getBlogBySlug(db: Db, slug: string): BlogRow | null {
  const row = db.prepare<[string], BlogRow>('SELECT * FROM blogs WHERE slug = ?').get(slug);
  return row ?? null;
}

export function getBlogById(db: Db, id: number): BlogRow | null {
  const row = db.prepare<[number], BlogRow>('SELECT * FROM blogs WHERE id = ?').get(id);
  return row ?? null;
}

export function listBlogPosts(db: Db, publishedOnly = false): BlogListItem[] {
  let query = `SELECT id, slug, title, summary, published, tags, created_at, updated_at FROM blogs`;
  if (publishedOnly) query += ' WHERE published = 1';
  query += ' ORDER BY datetime(created_at) DESC, id DESC';
  return db.prepare<[], BlogListItem>(query).all();
}

// Insert a new blog row. Throws on slug collision (UNIQUE constraint).
// Caller is responsible for slug validation / kebab-case generation.
export function insertBlog(db: Db, fields: {
  slug: string;
  title: string;
  summary: string;
  body_markdown: string;
  tags: string;
  published: number;
}): number {
  const now = new Date().toISOString();
  const r = db.prepare(
    `INSERT INTO blogs (slug, title, summary, body_markdown, published, tags, created_at, updated_at)
     VALUES (@slug, @title, @summary, @body, @published, @tags, @now, @now)`,
  ).run({
    slug: fields.slug,
    title: fields.title,
    summary: fields.summary,
    body: fields.body_markdown,
    published: fields.published,
    tags: fields.tags,
    now,
  });
  return Number(r.lastInsertRowid);
}

// Partial update — only the fields passed in `patch` are written. Always bumps
// updated_at. Slug rename via `new_slug`. Returns the number of rows changed
// (0 if no row matched the locator).
export function updateBlogBySlugOrId(
  db: Db,
  locator: { slug?: string; id?: number },
  patch: {
    title?: string;
    summary?: string;
    body_markdown?: string;
    tags?: string;
    published?: number;
    new_slug?: string;
  },
): number {
  const now = new Date().toISOString();
  const sets: string[] = [];
  const params: Record<string, unknown> = { now };

  if (patch.title !== undefined) { sets.push('title = @title'); params.title = patch.title; }
  if (patch.summary !== undefined) { sets.push('summary = @summary'); params.summary = patch.summary; }
  if (patch.body_markdown !== undefined) { sets.push('body_markdown = @body'); params.body = patch.body_markdown; }
  if (patch.tags !== undefined) { sets.push('tags = @tags'); params.tags = patch.tags; }
  if (patch.published !== undefined) { sets.push('published = @published'); params.published = patch.published; }
  if (patch.new_slug !== undefined) { sets.push('slug = @new_slug'); params.new_slug = patch.new_slug; }

  if (sets.length === 0) {
    // Nothing to change — still bump updated_at to record the touch? No:
    // a no-op update is misleading. Require at least one field.
    throw new Error('updateBlogBySlugOrId called with no patch fields');
  }
  sets.push('updated_at = @now');

  let where: string;
  if (locator.id !== undefined) {
    where = 'WHERE id = @id';
    params.id = locator.id;
  } else if (locator.slug !== undefined) {
    where = 'WHERE slug = @slug';
    params.slug = locator.slug;
  } else {
    throw new Error('updateBlogBySlugOrId requires slug or id');
  }

  const r = db.prepare(`UPDATE blogs SET ${sets.join(', ')} ${where}`).run(params);
  return r.changes;
}
