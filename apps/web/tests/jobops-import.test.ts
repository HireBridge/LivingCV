import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, type Db } from '@livingcv/db';
import { decideJobOpsImportChanges, listJobOpsImportChanges } from '../src/lib/jobops-import';

let db: Db;
let dir: string;

const packet = {
  identity: { fullName: 'Candidate Name', githubUrl: 'https://github.com/candidate' },
  taglines: [{ archetype: 'default', text: 'ML engineer shipping reliable systems' }],
  summary: 'Builds production machine-learning platforms.',
  experience: [],
  education: [],
  skills: [{ name: 'TypeScript', category: 'Languages' }],
  projects: [{ slug: 'public-project', name: 'Public Project', tagline: 'Public evidence', url: 'https://github.com/candidate/public-project' }],
  version: '1',
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'livingcv-jobops-import-'));
  db = openDb(join(dir, 'portfolio.db'));
  db.prepare(
    `INSERT INTO synced_state (key, value, source, synced_at) VALUES ('career_packet', ?, 'jobops', ?)`,
  ).run(JSON.stringify(packet), new Date().toISOString());
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('JobOps import review', () => {
  it('previews changes without writing to the portfolio', () => {
    const preview = listJobOpsImportChanges(db);
    expect(preview?.changes.map((change) => change.id)).toEqual(['hero', 'background', 'skills', 'project:public-project']);
    expect(db.prepare('SELECT COUNT(*) AS n FROM projects').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM site_content').get()).toEqual({ n: 0 });
  });

  it('publishes only selected approved changes and records rejection decisions', () => {
    expect(decideJobOpsImportChanges(db, ['hero', 'project:public-project'], 'approved')).toBe(2);
    expect(decideJobOpsImportChanges(db, ['skills'], 'rejected')).toBe(1);

    const hero = db.prepare("SELECT content FROM site_content WHERE section_key = 'hero'").get() as { content: string };
    expect(JSON.parse(hero.content).name).toBe('Candidate Name');
    expect(db.prepare('SELECT title, repo_url FROM projects WHERE slug = ?').get('public-project')).toEqual({
      title: 'Public Project', repo_url: 'https://github.com/candidate/public-project',
    });
    expect(db.prepare("SELECT COUNT(*) AS n FROM site_content WHERE section_key = 'signals'").get()).toEqual({ n: 0 });

    const preview = listJobOpsImportChanges(db);
    expect(preview?.changes.find((change) => change.id === 'skills')?.decision).toBe('rejected');
    expect(preview?.changes.some((change) => change.id === 'hero')).toBe(false);
  });
});
