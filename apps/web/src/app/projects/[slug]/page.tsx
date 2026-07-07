import { notFound } from 'next/navigation';
import { compileMDX } from 'next-mdx-remote/rsc';
import type { Metadata } from 'next';
import { getDb } from '@/lib/db';
import {
  getProjectBySlug,
  getPublishedCaseStudyByProject,
} from '@/lib/content';
import { getAllSettings } from '@/lib/settings';
import { recordPageView } from '@/lib/page-views';
import { parseJson } from '@/lib/parse-json';
import type { CaseStudyFrontmatter } from '@/lib/types';
import { BASE_CSS } from '@/templates/classic/styles';

export const dynamic = 'force-dynamic';

const ARTICLE_CSS = `
main.article-wrap{ max-width:var(--max); margin:0 auto; padding:56px 28px 90px; }
.article-kicker{ font-family:'JetBrains Mono', monospace; font-size:0.78rem; color:var(--ink-soft); text-transform:uppercase; letter-spacing:0.08em; margin:0 0 18px; }
h1.article-title{ font-family:'Space Grotesk', sans-serif; font-size:clamp(2rem,4vw,3rem); font-weight:700; letter-spacing:-0.02em; margin:0 0 12px; line-height:1.1; }
.article-summary{ color:var(--ink-soft); font-size:1.15rem; max-width:640px; margin:0 0 32px; font-style:italic; }
.article-meta{ display:flex; flex-wrap:wrap; gap:14px 24px; font-size:0.86rem; font-family:'JetBrains Mono', monospace; color:var(--ink-soft); margin:0 0 18px; padding:14px 0; border-top:1px solid var(--rule); border-bottom:1px solid var(--rule); }
.article-meta a{ color:var(--signal); }
.article-highlights{ background:var(--signal-soft); border-radius:6px; padding:18px 22px; margin:0 0 36px; max-width:640px; }
.article-highlights h4{ font-family:'Space Grotesk'; font-size:0.8rem; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; color:var(--signal); margin:0 0 10px; }
.article-highlights ul{ margin:0; padding-left:20px; }
.article-highlights li{ margin:0 0 6px; font-size:0.95rem; }
.prose{ font-family:'Source Serif 4', Georgia, serif; max-width:640px; }
.prose h2{ font-family:'Space Grotesk', sans-serif; font-size:1.4rem; font-weight:700; letter-spacing:-0.01em; margin:40px 0 12px; }
.prose h3{ font-family:'Space Grotesk', sans-serif; font-size:1.1rem; font-weight:600; margin:28px 0 8px; }
.prose p{ margin:0 0 16px; line-height:1.6; }
.prose code{ font-family:'JetBrains Mono', monospace; font-size:0.88em; background:var(--paper-deep); padding:2px 6px; border-radius:3px; border:1px solid var(--rule); }
.prose pre{ background:var(--paper-deep); border:1px solid var(--rule); border-radius:5px; padding:14px 16px; overflow-x:auto; }
.prose pre code{ background:none; border:none; padding:0; }
.prose blockquote{ border-left:3px solid var(--rule); margin:0 0 16px; padding:4px 16px; color:var(--ink-soft); font-style:italic; }
.prose ul, .prose ol{ margin:0 0 16px; padding-left:24px; }
.prose li{ margin-bottom:4px; }
.prose a{ color:var(--signal); }
.back-link{ display:inline-block; margin-top:40px; font-family:'JetBrains Mono', monospace; font-size:0.86rem; color:var(--signal); text-decoration:none; }
.back-link:hover{ color:var(--rust); }
`;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const db = getDb();
  const project = getProjectBySlug(db, slug);
  if (!project) return { title: 'Not found' };
  const cs = getPublishedCaseStudyByProject(db, project.id);
  if (!cs) return { title: 'Not found' };
  const fm = parseJson<CaseStudyFrontmatter>(cs.frontmatter, {
    title: '',
    summary: '',
    stack: [],
    status: '',
    links: {},
    highlights: [],
  });
  const s = getAllSettings(db);
  const site = s['site.title'] || s['site.domain'] || 'Portfolio';
  return {
    title: { absolute: `${fm.title} · ${site}` },
    description: fm.summary,
  };
}

export default async function CaseStudyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = getDb();
  const project = getProjectBySlug(db, slug);
  if (!project) notFound();
  const cs = getPublishedCaseStudyByProject(db, project.id);
  if (!cs) notFound();
  const fm = parseJson<CaseStudyFrontmatter>(cs.frontmatter, {
    title: '',
    summary: '',
    stack: [],
    status: '',
    links: {},
    highlights: [],
  });
  recordPageView(db, `/projects/${slug}`);
  const { content } = await compileMDX({
    source: cs.body_markdown ?? '',
  });
  const repo = fm.links?.repo;
  const pkg = fm.links?.package;
  const demo = fm.links?.demo;
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: BASE_CSS }} />
      <style dangerouslySetInnerHTML={{ __html: ARTICLE_CSS }} />
      <main className="article-wrap">
        <p className="article-kicker">Case study</p>
        <h1 className="article-title">{fm.title}</h1>
        {fm.summary ? <p className="article-summary">{fm.summary}</p> : null}
        {(fm.status || fm.date_started || repo || pkg || demo || (fm.stack && fm.stack.length > 0)) ? (
          <div className="article-meta">
            {fm.status ? <span>status · {fm.status}</span> : null}
            {fm.date_started ? <span>started · {fm.date_started}</span> : null}
            {repo ? <a href={repo} target="_blank" rel="noopener noreferrer">repo ↗</a> : null}
            {pkg ? <a href={pkg} target="_blank" rel="noopener noreferrer">package ↗</a> : null}
            {demo ? <a href={demo} target="_blank" rel="noopener noreferrer">demo ↗</a> : null}
            {fm.stack && fm.stack.length > 0 ? <span>stack · {fm.stack.join(', ')}</span> : null}
          </div>
        ) : null}
        {fm.highlights && fm.highlights.length > 0 ? (
          <div className="article-highlights">
            <h4>Highlights</h4>
            <ul>
              {fm.highlights.map((h, i) => (
                <li key={i}>{h}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="prose">{content}</div>
        <a className="back-link" href="/#projects">← Back to projects</a>
      </main>
    </>
  );
}
