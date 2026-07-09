import { describe, it, expect } from 'vitest';
import { deriveDemonstratedSignals } from '../src/lib/content';
import type { ProjectRow } from '../src/lib/types';

function project(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: 1,
    slug: 'test',
    title: 'Test Project',
    tagline: '',
    kind: null,
    role: null,
    repo_url: null,
    demo_url: null,
    package_url: null,
    stack: null,
    status: null,
    sort_order: null,
    featured: 1,
    diagram_svg: null,
    body: null,
    install_cmd: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

describe('deriveDemonstratedSignals', () => {
  it('derives a repo signal when repo_url is set', () => {
    const signals = deriveDemonstratedSignals(
      [project({ repo_url: 'https://github.com/x/y' })],
      () => false,
    );
    expect(signals).toHaveLength(1);
    expect(signals[0]!.label).toBe('Open-source contributor');
    expect(signals[0]!.evidenceType).toBe('repo');
  });

  it('derives a kind signal for OSS projects', () => {
    const signals = deriveDemonstratedSignals(
      [project({ kind: 'oss', slug: 'oss-proj' })],
      () => false,
    );
    const kindSignals = signals.filter((s) => s.evidenceType === 'kind');
    expect(kindSignals).toHaveLength(1);
    expect(kindSignals[0]!.label).toBe('Open-source maintainer');
    expect(kindSignals[0]!.sourceSlug).toBe('oss-proj');
  });

  it('derives a case-study signal when a case study exists', () => {
    const signals = deriveDemonstratedSignals(
      [project({ slug: 'studied' })],
      () => true,
    );
    expect(signals).toHaveLength(1);
    expect(signals[0]!.evidenceType).toBe('case-study');
    expect(signals[0]!.label).toBe('Wrote case study');
    expect(signals[0]!.evidenceUrl).toBe('/projects/studied');
  });

  it('deduplicates identical labels across projects', () => {
    const signals = deriveDemonstratedSignals(
      [
        project({ id: 1, slug: 'a', kind: 'oss', repo_url: 'https://a' }),
        project({ id: 2, slug: 'b', kind: 'oss', repo_url: 'https://b' }),
      ],
      () => false,
    );
    // "Open-source contributor" and "Open-source maintainer" each appear only once.
    const labels = signals.map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
    // First project's evidence link wins.
    const ossMaintainer = signals.find((s) => s.label === 'Open-source maintainer');
    expect(ossMaintainer?.sourceSlug).toBe('a');
  });

  it('returns an empty array for projects without evidence', () => {
    const signals = deriveDemonstratedSignals(
      [project()],
      () => false,
    );
    expect(signals).toEqual([]);
  });
});
