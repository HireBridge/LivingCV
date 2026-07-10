import type { Db } from '@livingcv/db';
import {
  TemplatePropsSchema,
  ProjectPropsSchema,
  SETTING_KEYS,
} from '@livingcv/shared';
import type {
  TemplateProps,
  ProjectProps,
  MiniProjectProps,
  ThemeProps,
  LinkItem,
  EvidenceSignal,
  AssertedSignal,
} from '@livingcv/shared';
import { parseJson } from './parse-json';
import { normalizeProjectBody } from './project-body';
import { getAllSettings } from './settings';
import type {
  ProjectRow,
  CaseStudyRow,
  HeroContent,
  BackgroundContent,
  FooterContent,
} from './types';

// ── Templates / sections ────────────────────────────────────────────────────

export function getActiveTemplateSlug(db: Db): string {
  const row = db
    .prepare<[string], { value: string }>('SELECT value FROM app_settings WHERE key = ?')
    .get(SETTING_KEYS.siteActiveTemplate);
  return row?.value || 'classic';
}

export function setActiveTemplate(db: Db, slug: string): void {
  const now = new Date().toISOString();
  db.prepare(
    'INSERT OR REPLACE INTO app_settings (key, value, encrypted, updated_at) VALUES (?, ?, 0, ?)',
  ).run(SETTING_KEYS.siteActiveTemplate, slug, now);
}

export function getSection<T>(
  db: Db,
  templateSlug: string,
  sectionKey: string,
  fallback: T,
): T {
  const row = db
    .prepare<[string, string], { content: string }>(
      'SELECT content FROM site_content WHERE template_slug = ? AND section_key = ? ORDER BY id DESC LIMIT 1',
    )
    .get(templateSlug, sectionKey);
  return parseJson<T>(row?.content, fallback);
}

export function setSection(
  db: Db,
  templateSlug: string,
  sectionKey: string,
  content: unknown,
): void {
  const json = JSON.stringify(content);
  const now = new Date().toISOString();

  db.prepare(
    'INSERT INTO site_content (template_slug, section_key, content, position, updated_at) VALUES (?, ?, ?, 0, ?)',
  ).run(templateSlug, sectionKey, json, now);

  db.prepare(
    `DELETE FROM site_content WHERE template_slug = ? AND section_key = ?
     AND id NOT IN (SELECT id FROM site_content WHERE template_slug = ? AND section_key = ? ORDER BY id DESC LIMIT 20)`,
  ).run(templateSlug, sectionKey, templateSlug, sectionKey);
}

// ── Projects ────────────────────────────────────────────────────────────────

export function listProjects(db: Db): ProjectRow[] {
  return db
    .prepare<[], ProjectRow>(
      'SELECT * FROM projects ORDER BY COALESCE(sort_order, id), id ASC',
    )
    .all();
}

export function getProjectBySlug(db: Db, slug: string): ProjectRow | null {
  const row = db.prepare<[string], ProjectRow>('SELECT * FROM projects WHERE slug = ?').get(slug);
  return row ?? null;
}

export function getProjectById(db: Db, id: number): ProjectRow | null {
  const row = db.prepare<[number], ProjectRow>('SELECT * FROM projects WHERE id = ?').get(id);
  return row ?? null;
}

export function createProject(db: Db, fields: Partial<ProjectRow> & { slug: string; title: string }): number {
  const now = new Date().toISOString();
  const r = db
    .prepare(
      `INSERT INTO projects (slug, title, tagline, kind, role, repo_url, demo_url, package_url, stack, status, sort_order, featured, diagram_svg, body, install_cmd, created_at, updated_at)
       VALUES (@slug, @title, @tagline, @kind, @role, @repo_url, @demo_url, @package_url, @stack, @status, @sort_order, @featured, @diagram_svg, @body, @install_cmd, @created_at, @updated_at)`,
    )
    .run({
      slug: fields.slug,
      title: fields.title,
      tagline: fields.tagline ?? null,
      kind: fields.kind ?? null,
      role: fields.role ?? null,
      repo_url: fields.repo_url ?? null,
      demo_url: fields.demo_url ?? null,
      package_url: fields.package_url ?? null,
      stack: fields.stack ?? null,
      status: fields.status ?? null,
      sort_order: fields.sort_order ?? null,
      featured: fields.featured ?? 0,
      diagram_svg: fields.diagram_svg ?? null,
      body: fields.body ?? null,
      install_cmd: fields.install_cmd ?? null,
      created_at: now,
      updated_at: now,
    });
  return Number(r.lastInsertRowid);
}

export function updateProject(db: Db, id: number, fields: Partial<ProjectRow>): void {
  const now = new Date().toISOString();
  const setClauses: string[] = [];
  const params: Record<string, unknown> = { id, updated_at: now };
  
  for (const [k, v] of Object.entries(fields)) {
    if (k !== 'id' && k !== 'created_at' && k !== 'updated_at') {
      setClauses.push(`${k} = @${k}`);
      params[k] = v;
    }
  }
  
  if (setClauses.length === 0) return;
  setClauses.push('updated_at = @updated_at');
  
  db.prepare(`UPDATE projects SET ${setClauses.join(', ')} WHERE id = @id`).run(params);
}

export function deleteProject(db: Db, id: number): void {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
}

// ── Case studies ────────────────────────────────────────────────────────────

export function hasPublishedCaseStudy(db: Db, projectId: number): boolean {
  const row = db
    .prepare<[number], { c: number }>(
      'SELECT 1 AS c FROM case_studies WHERE project_id = ? AND published = 1',
    )
    .get(projectId);
  return row !== undefined;
}

export function getPublishedCaseStudyByProject(db: Db, projectId: number): CaseStudyRow | null {
  const row = db
    .prepare<[number], CaseStudyRow>(
      'SELECT * FROM case_studies WHERE project_id = ? AND published = 1 LIMIT 1',
    )
    .get(projectId);
  return row ?? null;
}

export function getCaseStudyBySlug(db: Db, slug: string): CaseStudyRow | null {
  const row = db.prepare<[string], CaseStudyRow>('SELECT * FROM case_studies WHERE slug = ?').get(slug);
  return row ?? null;
}

export function listCaseStudies(db: Db): CaseStudyRow[] {
  return db.prepare<[], CaseStudyRow>('SELECT * FROM case_studies ORDER BY id ASC').all();
}

export function upsertCaseStudy(
  db: Db,
  fields: {
    id?: number;
    project_id: number | null;
    slug: string;
    frontmatter: string | null;
    body_markdown: string | null;
    published: number;
  },
): number {
  const now = new Date().toISOString();
  if (fields.id !== undefined) {
    db.prepare(
      `UPDATE case_studies SET project_id = @project_id, slug = @slug, frontmatter = @frontmatter,
        body_markdown = @body_markdown, published = @published, updated_at = @updated_at WHERE id = @id`,
    ).run({
      id: fields.id,
      project_id: fields.project_id,
      slug: fields.slug,
      frontmatter: fields.frontmatter,
      body_markdown: fields.body_markdown,
      published: fields.published,
      updated_at: now,
    });
    return fields.id;
  }
  const r = db
    .prepare(
      `INSERT INTO case_studies (project_id, slug, frontmatter, body_markdown, published, created_at, updated_at)
       VALUES (@project_id, @slug, @frontmatter, @body_markdown, @published, @created_at, @updated_at)`,
    )
    .run({
      project_id: fields.project_id,
      slug: fields.slug,
      frontmatter: fields.frontmatter,
      body_markdown: fields.body_markdown,
      published: fields.published,
      created_at: now,
      updated_at: now,
    });
  return Number(r.lastInsertRowid);
}

// ── Build TemplateProps from the DB ─────────────────────────────────────────

// Derive demonstrated (provenance-backed) signals from project data.
// Deduplicates by label so a user with N similar projects doesn't render
// the same signal N times (the first occurrence keeps its evidence link).
export function deriveDemonstratedSignals(
  projects: ProjectRow[],
  hasCaseStudy: (projectId: number) => boolean,
): EvidenceSignal[] {
  const demonstrated: EvidenceSignal[] = [];
  const seenLabels = new Set<string>();
  for (const p of projects) {
    const maybeAdd = (s: EvidenceSignal) => {
      if (!seenLabels.has(s.label)) { seenLabels.add(s.label); demonstrated.push(s); }
    };
    if (p.repo_url) maybeAdd({ label: 'Open-source contributor', evidenceUrl: p.repo_url, evidenceType: 'repo', sourceSlug: p.slug });
    if (p.demo_url) maybeAdd({ label: 'Shipped live product', evidenceUrl: p.demo_url, evidenceType: 'demo', sourceSlug: p.slug });
    if (p.package_url) maybeAdd({ label: 'Published package', evidenceUrl: p.package_url, evidenceType: 'package', sourceSlug: p.slug });
    if (hasCaseStudy(p.id)) maybeAdd({ label: 'Wrote case study', evidenceUrl: `/projects/${p.slug}`, evidenceType: 'case-study', sourceSlug: p.slug });
    if (p.kind === 'oss') maybeAdd({ label: 'Open-source maintainer', evidenceUrl: p.repo_url || `/projects/${p.slug}`, evidenceType: 'kind', sourceSlug: p.slug });
    if (p.kind === 'commercial') maybeAdd({ label: 'Commercial product', evidenceUrl: p.demo_url || `/projects/${p.slug}`, evidenceType: 'kind', sourceSlug: p.slug });
  }
  return demonstrated;
}

function projectRowToProps(p: ProjectRow, hasCaseStudy: boolean): ProjectProps {
  const { columns, diagramCaption } = normalizeProjectBody(parseJson<unknown>(p.body, {}));
  const links: LinkItem[] = [];
  if (p.repo_url) links.push({ label: 'repo', href: p.repo_url });
  if (p.demo_url) links.push({ label: 'demo', href: p.demo_url });
  if (p.package_url) links.push({ label: 'package', href: p.package_url });
  return ProjectPropsSchema.parse({
    slug: p.slug,
    name: p.title || p.slug,
    kind: p.kind ?? undefined,
    status: p.status ?? undefined,
    links,
    tagline: p.tagline ?? '',
    diagramSvg: p.diagram_svg ?? undefined,
    diagramCaption: diagramCaption ?? undefined,
    body: { columns },
    installCmd: p.install_cmd ?? undefined,
    hasCaseStudy,
  });
}

export function buildTemplateProps(db: Db): TemplateProps {
  const slug = getActiveTemplateSlug(db);
  const hero = getSection<HeroContent>(db, slug, 'hero', {
    eyebrow: '',
    name: '',
    roleLine: '',
    links: [],
  });
  const background = getSection<BackgroundContent>(db, slug, 'background', {
    kicker: '',
    title: '',
    paragraphs: [],
  });
  const footer = getSection<FooterContent>(db, slug, 'footer', { links: [], note: '' });
  const theme = getSection<ThemeProps>(db, slug, 'theme', {});
  const sectionOrder = getSection<string[]>(db, slug, 'order', ['hero', 'projects', 'alsoShipped', 'background']);

  const hiddenSections = getSection<string[]>(db, slug, 'hidden', []);
  const customSections = getSection<{ id: string, title: string, content: string }[]>(db, slug, 'custom_sections', []);

  const projects = listProjects(db);
  const featured: ProjectProps[] = [];
  const alsoShipped: MiniProjectProps[] = [];
  for (const p of projects) {
    const hasCs = hasPublishedCaseStudy(db, p.id);
    if (p.featured === 1) {
      featured.push(projectRowToProps(p, hasCs));
    } else {
      alsoShipped.push({ slug: p.slug, name: p.title, description: p.tagline ?? '' });
    }
  }

  const allSettings = getAllSettings(db);
  const contactEnabled = !!(allSettings['telegram.bot_token'] || allSettings['google.client_id']);
  // Public MCP is opt-in: the TalentMCP nav button shows only when the operator
  // enables it in Settings → MCP → Public MCP.
  const talentMcpEnabled = (allSettings['publicmcp.enabled'] ?? '0') === '1';

  // Derive demonstrated signals from project data.
  const demonstrated = deriveDemonstratedSignals(projects, (id) => hasPublishedCaseStudy(db, id));
  // Load asserted signals (admin-authored, from site_content section 'signals').
  const asserted = getSection<AssertedSignal[]>(db, slug, 'signals', []);

  return TemplatePropsSchema.parse({
    hero: {
      eyebrow: hero.eyebrow,
      name: hero.name,
      roleLine: hero.roleLine,
      links: hero.links,
      diagramCenterLabel: hero.diagramCenterLabel,
      diagram: hero.diagram,
    },
    projects: featured,
    alsoShipped,
    background: {
      kicker: background.kicker,
      title: background.title,
      paragraphs: background.paragraphs,
    },
    footer: { links: footer.links, note: footer.note ?? '' },
    theme,
    sectionOrder,
    hiddenSections,
    customSections,
    contactEnabled,
    talentMcpEnabled,
    signals: { demonstrated, asserted },
  });
}
