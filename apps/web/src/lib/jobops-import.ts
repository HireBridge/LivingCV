import { createHash } from 'node:crypto';
import type { Db } from '@livingcv/db';
import { CareerPacketSchema } from '@livingcv/shared';
import type { CareerPacket } from '@livingcv/shared';
import { createProject, getActiveTemplateSlug, getProjectBySlug, getSection, setSection, updateProject } from './content';
import type { BackgroundContent, HeroContent } from './types';

export type ImportDecision = 'pending' | 'approved' | 'rejected';

export interface JobOpsImportChange {
  id: string;
  kind: 'hero' | 'background' | 'skills' | 'project';
  label: string;
  current: unknown;
  proposed: unknown;
  decision: ImportDecision;
}

interface ImportReviewState {
  packetHash: string;
  decisions: Record<string, Exclude<ImportDecision, 'pending'>>;
  updatedAt: string;
}

const PACKET_KEY = 'career_packet';
const REVIEW_KEY = 'career_packet_import_review';

function stableHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function readReviewState(db: Db): ImportReviewState | null {
  const row = db.prepare<[string], { value: string }>('SELECT value FROM synced_state WHERE key = ?').get(REVIEW_KEY);
  if (!row) return null;
  try { return JSON.parse(row.value) as ImportReviewState; } catch { return null; }
}

function writeReviewState(db: Db, state: ImportReviewState): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO synced_state (key, value, source, synced_at) VALUES (?, ?, 'livingcv-review', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, source = excluded.source, synced_at = excluded.synced_at`,
  ).run(REVIEW_KEY, JSON.stringify(state), now);
}

export function getSyncedJobOpsPacket(db: Db): { packet: CareerPacket; packetHash: string; syncedAt: string } | null {
  const row = db.prepare<[string], { value: string; synced_at: string }>(
    'SELECT value, synced_at FROM synced_state WHERE key = ?',
  ).get(PACKET_KEY);
  if (!row) return null;
  try {
    const packet = CareerPacketSchema.parse(JSON.parse(row.value));
    return { packet, packetHash: stableHash(packet), syncedAt: row.synced_at };
  } catch {
    return null;
  }
}

function projectProposal(project: CareerPacket['projects'][number], index: number) {
  return {
    slug: project.slug,
    title: project.name,
    tagline: project.tagline ?? '',
    repo_url: project.url ?? null,
    kind: project.url?.includes('github.com') ? 'oss' : null,
    status: 'active',
    featured: index < 4 ? 1 : 0,
    sort_order: index + 1,
  };
}

export function listJobOpsImportChanges(db: Db): { packetHash: string; syncedAt: string; changes: JobOpsImportChange[] } | null {
  const synced = getSyncedJobOpsPacket(db);
  if (!synced) return null;
  const { packet, packetHash, syncedAt } = synced;
  const template = getActiveTemplateSlug(db);
  const state = readReviewState(db);
  const decisions = state?.packetHash === packetHash ? state.decisions : {};
  const changes: JobOpsImportChange[] = [];
  const add = (change: Omit<JobOpsImportChange, 'decision'>) => {
    if (stableHash(change.current) !== stableHash(change.proposed)) {
      changes.push({ ...change, decision: decisions[change.id] ?? 'pending' });
    }
  };

  const currentHero = getSection<HeroContent>(db, template, 'hero', { eyebrow: '', name: '', roleLine: '', links: [] });
  const links = [
    packet.identity.githubUrl ? { label: 'GitHub', href: packet.identity.githubUrl } : null,
    packet.identity.linkedinUrl ? { label: 'LinkedIn', href: packet.identity.linkedinUrl } : null,
    packet.identity.portfolioUrl ? { label: 'Portfolio', href: packet.identity.portfolioUrl } : null,
  ].filter((link): link is { label: string; href: string } => Boolean(link));
  add({
    id: 'hero', kind: 'hero', label: 'Profile identity and links', current: currentHero,
    proposed: { ...currentHero, name: packet.identity.fullName, roleLine: packet.taglines[0]?.text ?? currentHero.roleLine, links },
  });

  const currentBackground = getSection<BackgroundContent>(db, template, 'background', { kicker: '', title: '', paragraphs: [] });
  const backgroundParagraphs = [
    packet.summary,
    ...packet.experience.map((item) => `${item.title} at ${item.company}${item.bullets[0]?.text ? ` — ${item.bullets[0].text}` : ''}`),
    ...packet.education.map((item) => [item.degree, item.field, item.institution].filter(Boolean).join(', ')),
  ].filter((text): text is string => Boolean(text));
  add({
    id: 'background', kind: 'background', label: 'Background, experience, and education', current: currentBackground,
    proposed: { ...currentBackground, title: currentBackground.title || 'Background', paragraphs: backgroundParagraphs },
  });

  const currentSkills = getSection<{ label: string; category?: string }[]>(db, template, 'signals', []);
  const proposedSkills = packet.skills.map((skill) => ({ label: skill.name, ...(skill.category ? { category: skill.category } : {}) }));
  add({ id: 'skills', kind: 'skills', label: `${proposedSkills.length} skills`, current: currentSkills, proposed: proposedSkills });

  packet.projects.forEach((project, index) => {
    const current = getProjectBySlug(db, project.slug);
    add({
      id: `project:${project.slug}`, kind: 'project', label: `Project: ${project.name}`,
      current: current ? { slug: current.slug, title: current.title, tagline: current.tagline, repo_url: current.repo_url, kind: current.kind, status: current.status, featured: current.featured, sort_order: current.sort_order } : null,
      proposed: projectProposal(project, index),
    });
  });
  return { packetHash, syncedAt, changes };
}

function applyChange(db: Db, change: JobOpsImportChange): void {
  const template = getActiveTemplateSlug(db);
  if (change.kind === 'hero') setSection(db, template, 'hero', change.proposed);
  else if (change.kind === 'background') setSection(db, template, 'background', change.proposed);
  else if (change.kind === 'skills') setSection(db, template, 'signals', change.proposed);
  else {
    const proposed = change.proposed as ReturnType<typeof projectProposal>;
    const existing = getProjectBySlug(db, proposed.slug);
    if (existing) updateProject(db, existing.id, proposed);
    else createProject(db, proposed);
  }
}

export function decideJobOpsImportChanges(db: Db, ids: string[], decision: Exclude<ImportDecision, 'pending'>): number {
  const preview = listJobOpsImportChanges(db);
  if (!preview) return 0;
  const selected = new Set(ids);
  const state = readReviewState(db);
  const decisions = state?.packetHash === preview.packetHash ? { ...state.decisions } : {};
  let count = 0;
  const transaction = db.transaction(() => {
    for (const change of preview.changes) {
      if (!selected.has(change.id)) continue;
      if (decision === 'approved') applyChange(db, change);
      decisions[change.id] = decision;
      count += 1;
    }
    writeReviewState(db, { packetHash: preview.packetHash, decisions, updatedAt: new Date().toISOString() });
  });
  transaction();
  return count;
}
