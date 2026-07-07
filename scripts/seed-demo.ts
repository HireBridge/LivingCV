// Demo seed: populates a complete fictional persona so an OSS user sees a
// fully working site before entering real content. The persona is *fictional*
// (Alex Rivera) with made-up projects and links. The real operator's content
// is entered via the admin UI (or a private seed kept out of the repo).
//
// Run from the repo root: `npx tsx scripts/seed-demo.ts`
//
// Re-runnable: it resets the demo rows to the canned content. Real rows added
// later by the admin are NOT touched (we key on the `alex-*` slug prefix).

import { openDb } from '@mohith-das/portfolio-db';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DATA_DIR = resolve(process.env.DATA_DIR || './data');
mkdirSync(DATA_DIR, { recursive: true });
const db = openDb(join(DATA_DIR, 'portfolio.db'));

const now = () => new Date().toISOString();

function upsertSetting(key: string, value: string, encrypted = 0): void {
  db.prepare(
    'INSERT OR REPLACE INTO app_settings (key, value, encrypted, updated_at) VALUES (?, ?, ?, ?)',
  ).run(key, value, encrypted, now());
}

function upsertSection(templateSlug: string, sectionKey: string, content: unknown): void {
  const json = JSON.stringify(content);
  db.prepare(
    'INSERT OR REPLACE INTO site_content (template_slug, section_key, content, position, updated_at) VALUES (?, ?, ?, 0, ?)',
  ).run(templateSlug, sectionKey, json, now());
}

function upsertProject(p: {
  slug: string;
  title: string;
  tagline: string;
  kind: string;
  repo_url?: string;
  demo_url?: string;
  package_url?: string;
  stack: string[];
  status: string;
  sort_order: number;
  featured: 0 | 1;
  body: { designDecision: string; whatsReal: string; honestConstraint: string };
  install_cmd?: string;
}): number {
  const existing = db.prepare<[string], { id: number }>('SELECT id FROM projects WHERE slug = ?').get(p.slug);
  if (existing) {
    db.prepare(
      `UPDATE projects SET title=@title, tagline=@tagline, kind=@kind, repo_url=@repo_url, demo_url=@demo_url,
        package_url=@package_url, stack=@stack, status=@status, sort_order=@sort_order, featured=@featured,
        body=@body, install_cmd=@install_cmd, updated_at=@updated_at WHERE id=@id`,
    ).run({
      id: existing.id,
      title: p.title,
      tagline: p.tagline,
      kind: p.kind,
      repo_url: p.repo_url ?? null,
      demo_url: p.demo_url ?? null,
      package_url: p.package_url ?? null,
      stack: JSON.stringify(p.stack),
      status: p.status,
      sort_order: p.sort_order,
      featured: p.featured,
      body: JSON.stringify(p.body),
      install_cmd: p.install_cmd ?? null,
      updated_at: now(),
    });
    return existing.id;
  }
  const r = db
    .prepare(
      `INSERT INTO projects (slug, title, tagline, kind, role, repo_url, demo_url, package_url, stack, status, sort_order, featured, diagram_svg, body, install_cmd, created_at, updated_at)
       VALUES (@slug, @title, @tagline, @kind, @role, @repo_url, @demo_url, @package_url, @stack, @status, @sort_order, @featured, @diagram_svg, @body, @install_cmd, @created_at, @updated_at)`,
    )
    .run({
      slug: p.slug,
      title: p.title,
      tagline: p.tagline,
      kind: p.kind,
      role: null,
      repo_url: p.repo_url ?? null,
      demo_url: p.demo_url ?? null,
      package_url: p.package_url ?? null,
      stack: JSON.stringify(p.stack),
      status: p.status,
      sort_order: p.sort_order,
      featured: p.featured,
      diagram_svg: null,
      body: JSON.stringify(p.body),
      install_cmd: p.install_cmd ?? null,
      created_at: now(),
      updated_at: now(),
    });
  return Number(r.lastInsertRowid);
}

function upsertCaseStudy(cs: {
  slug: string;
  project_id: number;
  frontmatter: unknown;
  body_markdown: string;
  published: number;
}): void {
  const existing = db.prepare<[string], { id: number }>('SELECT id FROM case_studies WHERE slug = ?').get(cs.slug);
  const fm = JSON.stringify(cs.frontmatter);
  if (existing) {
    db.prepare(
      'UPDATE case_studies SET project_id=@project_id, frontmatter=@frontmatter, body_markdown=@body_markdown, published=@published, updated_at=@updated_at WHERE id=@id',
    ).run({
      id: existing.id,
      project_id: cs.project_id,
      frontmatter: fm,
      body_markdown: cs.body_markdown,
      published: cs.published,
      updated_at: now(),
    });
  } else {
    db.prepare(
      `INSERT INTO case_studies (project_id, slug, frontmatter, body_markdown, published, created_at, updated_at)
       VALUES (@project_id, @slug, @frontmatter, @body_markdown, @published, @created_at, @updated_at)`,
    ).run({
      project_id: cs.project_id,
      slug: cs.slug,
      frontmatter: fm,
      body_markdown: cs.body_markdown,
      published: cs.published,
      created_at: now(),
      updated_at: now(),
    });
  }
}

// ── 1. Site settings ────────────────────────────────────────────────────────
upsertSetting('site.title', 'Alex Rivera — Portfolio');
upsertSetting('site.domain', 'localhost:3000');
upsertSetting(
  'site.meta_description',
  'A fictional demo persona for the portfolio app — replace via the admin console once you sign in.',
);
upsertSetting('site.active_template', 'classic');

// ── 2. Template registry (marks classic as built-in) ───────────────────────
const TEMPLATE = 'classic';
{
  db.prepare(
    'INSERT OR IGNORE INTO templates (slug, name, description, is_builtin, component_ref) VALUES (?, ?, ?, 1, ?)',
  ).run(TEMPLATE, 'Classic', 'Paper / ink / signal / rust — bundled template.', 'classic');
}

// ── 3. site_content sections ────────────────────────────────────────────────
upsertSection(TEMPLATE, 'hero', {
  eyebrow: 'Builder · Applied AI Engineer',
  name: 'Alex Rivera',
  roleLine:
    'I build **practical agent infrastructure** for lean teams: durable tools, opinionated memory, and deployment-ready scaffolds.',
  links: [
    { label: 'GitHub', href: 'https://example.com/alex' },
    { label: 'npm', href: 'https://www.npmjs.com/~alex-rivera-demo' },
    { label: 'Email', href: 'mailto:[email protected]' },
  ],
  diagramCenterLabel: 'alex',
});

upsertSection(TEMPLATE, 'background', {
  kicker: '03 — Before this',
  title: 'Background',
  paragraphs: [
    'This is a fictional persona used by the seed script to show the bundled template. Replace the content via the admin console once you finish the setup wizard.',
    'Sample projects below demonstrate the classic template\u2019s project-card layout, three-column body, and install command. None of the names, repos, or numbers are real.',
  ],
});

upsertSection(TEMPLATE, 'footer', {
  links: [
    { label: 'github.com/example', href: 'https://example.com/alex' },
    { label: 'linkedin.com/in/example', href: 'https://example.com/in/alex' },
    { label: '[email protected]', href: 'mailto:[email protected]' },
    { label: 'Public MCP (AI agents)', href: '/mcp/public' },
  ],
  note: 'Alex Rivera · fictional demo persona · content flow from the database, not from code',
});

// ── 4. Projects (3 featured + 1 also-shipped) ──────────────────────────────
const tscrateId = upsertProject({
  slug: 'alex-tscrate',
  title: 'tscrate',
  tagline:
    'A zero-config TypeScript library scaffolder: pick a runtime, get a typed, tested, CI-ready package shell in one command.',
  kind: 'oss',
  repo_url: 'https://example.com/alex/tscrate',
  package_url: 'https://www.npmjs.com/package/alex-tscrate-demo',
  stack: ['TypeScript', 'Node.js', 'Vitest'],
  status: 'Live',
  sort_order: 1,
  featured: 1,
  body: {
    designDecision:
      'Generators over templates. Instead of cloning a starter repo, the CLI runs a small typed pipeline so every flag maps to one structural change and the output is deterministic.',
    whatsReal:
      '10+ runtime presets, an in-memory template cache, a public SDK for embedding the scaffolder, and 140 unit tests covering the merge step.',
    honestConstraint:
      'Customising beyond the supported presets still requires editing the generated files by hand. The scaffolder does not yet emit an interactive prompt-driven mode.',
  },
  install_cmd: 'npm i -g alex-tscrate && alex-tscrate init my-pkg',
});

upsertProject({
  slug: 'alex-mosaiq',
  title: 'mosaiq',
  tagline:
    'A thin retrieval middleware that wraps any vector store with a typed query DSL, batched ingest, and per-tenant isolation.',
  kind: 'oss',
  repo_url: 'https://example.com/alex/mosaiq',
  stack: ['TypeScript', 'SQLite', 'Zod'],
  status: 'Live',
  sort_order: 2,
  featured: 1,
  body: {
    designDecision:
      'Pushed the schema and the typed query layer behind a single Zod-derived contract so swapping the underlying vector store is a one-file change.',
    whatsReal:
      'SQLite-vec backend shipped, plus an OpenAI-embeddings client, batched ingest at 5k vectors/minute on a single node, and per-tenant namespace filtering enforced in the SQL.',
    honestConstraint:
      'No hybrid lexical+vector retrieval yet; the SQLite backend uses brute-force cosine which is fine to ~100k vectors per tenant but won\u2019t scale beyond that without a real ANN index.',
  },
  install_cmd: 'npm i alex-mosaiq',
});

upsertProject({
  slug: 'alex-edgeplan',
  title: 'edgeplan',
  tagline:
    'A small CLI that schedules and monitors long-running jobs across a fleet of mixed-architecture edge devices.',
  kind: 'oss',
  repo_url: 'https://example.com/alex/edgeplan',
  stack: ['Go', 'gRPC', 'SQLite'],
  status: 'In progress',
  sort_order: 3,
  featured: 1,
  body: {
    designDecision:
      'Adopted a gossip-based heartbeat over a central coordinator so the control plane survives link flapping, which is the dominant failure mode at the edge.',
    whatsReal:
      '20+ device fleet benchmarked end-to-end with a 2-second p95 plan latency and a 0.5% spurious-failure rate over a 48-hour soak test.',
    honestConstraint:
      'No migration tooling yet for swapping out the on-device state store, so upgrading the agent in place is a manual operation.',
  },
  install_cmd: 'go install example.com/alex/edgeplan@latest',
});

// Also-shipped (non-featured) → rendered as a mini card.
upsertProject({
  slug: 'alex-tinyrender',
  title: 'tinyrender',
  tagline:
    'A ~300-line markdown\u2192SVG renderer for embedding doc snippets in static exports without a full browser pipeline.',
  kind: 'oss',
  repo_url: 'https://example.com/alex/tinyrender',
  stack: ['TypeScript'],
  status: 'Archived',
  sort_order: 4,
  featured: 0,
  body: {
    designDecision: '',
    whatsReal: '',
    honestConstraint: '',
  },
});

// ── 5. One case study (for tscrate) ─────────────────────────────────────────
upsertCaseStudy({
  slug: 'alex-tscrate',
  project_id: tscrateId,
  published: 1,
  frontmatter: {
    title: 'tscrate',
    summary:
      'A zero-config TypeScript scaffolder that turns "pick a runtime + a test runner" into a typed, tested, CI-ready package.',
    stack: ['TypeScript', 'Node.js', 'Vitest'],
    status: 'Live',
    links: {
      repo: 'https://example.com/alex/tscrate',
      package: 'https://www.npmjs.com/package/alex-tscrate-demo',
    },
    highlights: [
      'Generator pipeline over a static starter repo — every flag maps to one structural change',
      '10+ runtime presets, deterministic output, 140 unit tests covering the merge step',
      'Public SDK for embedding the scaffolder in CI-driven package bootstrap flows',
    ],
  },
  body_markdown: `## The problem

Off-the-shelf TypeScript starters either ship a kitchen sink (every flag set,
every runtime supported) or a thin slice you outgrow in an afternoon. The
honest third option is a typed pipeline that maps each flag to exactly one
structural change, so the output is deterministic and reviewable.

## What I built

A CLI that runs a small dependency graph of file generators. The pipeline
ingests the user's flag set, validates it against a Zod schema, then emits the
resulting package layout. A public SDK exposes the generator so CI jobs can
bootstrap packages without shelling out to a CLI.

## Key decisions

**Generators over templates.** Each node in the pipeline is a function from
(flags, ctx) \u2192 (files, edits). The state of the working directory flows through
ctx, so two CLI runs with the same input produce byte-identical output. A
post-condition test verifies the directory hash matches a known good value.

**Schema-derived flags.** The flag schema is generated from the pipeline node
contracts, so a new node forces a typed flag. This caught four mismatches
between the docs and the CLI during pre-release \u2014 the tests would have, but
the schema constraint surfaces them at build time of the scaffolder itself.

**A SDK, not just a CLI.** CI jobs that want to bootstrap a package can import
the generator and pipe the result through their own review tooling, instead
of shelling out and parsing a directory diff.

## A real challenge

The first release of the scaffolder mis-handled an existing \`LICENSE\` file
when the user re-ran \`init\` against a directory that already had one: the
generator silently overwrote it with the canned MIT text. A reviewer caught
it by diffing before publishing, and the fix was a guard step that hashes the
existing LICENSE and short-circuits the overwrite only when the existing hash
matches the canned one.

## Results

- 140 unit tests covering the merge step, conflict resolution, and the SDK
  entry points.
- 8 runtime presets (Node ESM/CJS, Deno, Bun, browser ESM, worker, CLI,
  library) plus a \`custom\` mode that wraps user-supplied generators.
- Documented as the recommended bootstrap in two internal package templates.

## What's next / limitations

Customisation beyond the supported presets still requires editing the generated
files by hand, and there's no interactive prompt mode that would let a user
see a preview before committing to each flag. Migration tooling for moving
between presets is on the list but not built yet.`,
});

console.log('Demo seed complete.');
console.log('- 4 projects (3 featured + 1 mini)');
console.log('- 1 case study (alex-tscrate, published)');
console.log('- site_content: hero/background/footer for the classic template');
console.log('- site settings (site.title, site.domain, site.meta_description, site.active_template)');
console.log('Run the web app (next dev) and sign in at /admin/login.');
