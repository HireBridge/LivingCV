import { notFound } from 'next/navigation';
import { compileMDX } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import type { Metadata } from 'next';
import { getDb } from '@/lib/db';
import { getBlogBySlug } from '@/lib/blogs';
import { getAllSettings } from '@/lib/settings';
import { recordPageView } from '@/lib/page-views';
import { BASE_CSS } from '@/templates/classic/styles';
import { jsonLdSafe } from '@/lib/jsonld';

export const dynamic = 'force-dynamic';

const ARTICLE_CSS = `
main.article-wrap{ max-width: 720px; margin:0 auto; padding:56px 24px 90px; }
.article-kicker{ font-family:'JetBrains Mono', monospace; font-size:0.85rem; color:var(--ink-soft); text-transform:uppercase; letter-spacing:0.05em; margin:0 0 16px; }
h1.article-title{ font-family:'Space Grotesk', sans-serif; font-size:clamp(2.5rem,5vw,3.5rem); font-weight:700; letter-spacing:-0.02em; margin:0 0 24px; line-height:1.1; color:var(--ink); }
.article-meta{ display:flex; flex-wrap:wrap; gap:14px 24px; font-size:0.9rem; font-family:'JetBrains Mono', monospace; color:var(--ink-soft); margin:0 0 40px; padding:16px 0; border-top:1px solid var(--rule); border-bottom:1px solid var(--rule); }
.prose{ font-family:'Source Serif 4', Georgia, serif; font-size: 1.15rem; line-height: 1.7; color: #222; }
.prose h2{ font-family:'Space Grotesk', sans-serif; font-size:1.8rem; font-weight:700; letter-spacing:-0.01em; margin:48px 0 16px; color:var(--ink); }
.prose h3{ font-family:'Space Grotesk', sans-serif; font-size:1.4rem; font-weight:600; margin:32px 0 12px; color:var(--ink); }
.prose p{ margin:0 0 24px; }
.prose img, .prose video { max-width: 100%; border-radius: 8px; margin: 32px 0; border: 1px solid var(--rule); }
.prose code{ font-family:'JetBrains Mono', monospace; font-size:0.85em; background:var(--paper-deep); padding:3px 6px; border-radius:4px; color: var(--rust); }
.prose pre{ background: #111; color: #eee; border-radius:8px; padding:20px; overflow-x:auto; margin: 32px 0; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
.prose pre code{ background:none; border:none; padding:0; color: inherit; font-size: 0.9em; }
.prose blockquote{ border-left:4px solid var(--signal); margin:32px 0; padding:4px 0 4px 24px; color:var(--ink-soft); font-style:italic; font-size: 1.3rem; }
.prose ul, .prose ol{ margin:0 0 24px; padding-left:24px; }
.prose li{ margin-bottom:8px; }
.prose a{ color:var(--signal); text-decoration: underline; text-decoration-color: var(--signal-soft); text-underline-offset: 4px; }
.prose a:hover{ color:var(--rust); text-decoration-color: var(--rust); }
.back-link{ display:inline-block; margin-top:60px; font-family:'JetBrains Mono', monospace; font-size:0.95rem; color:var(--signal); text-decoration:none; padding: 8px 16px; border: 1px solid var(--rule); border-radius: 20px; }
.back-link:hover{ background: var(--signal-soft); color: var(--ink); border-color: var(--signal); }
@media (prefers-color-scheme: dark) {
  .prose { color: #ddd; }
}
`;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const db = getDb();
  let blog = null;
  try {
    blog = getBlogBySlug(db, slug);
  } catch {}
  if (!blog || !blog.published) return { title: 'Not found' };
  
  const s = getAllSettings(db);
  const domain = s['site.domain'] || '';
  const site = s['site.title'] || s['site.domain'] || 'Portfolio';
  
  // Blog uses DB columns mostly
  let customOgTitle, customOgDesc, customOgImage;

  const title = customOgTitle || blog.title;
  const description = customOgDesc || blog.summary;
  const ogImage = customOgImage || s['site.og_image_path'] || `/og?title=${encodeURIComponent(title)}&kind=blog`;
  const url = domain ? `https://${domain}/blog/${slug}` : `/blog/${slug}`;
  const twitter = s['site.twitter_handle'] || '';

  return {
    title: { absolute: `${title} · ${site}` },
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: site,
      type: 'article',
      images: [ogImage],
      locale: s['site.lang'] || 'en',
      publishedTime: blog.created_at,
      modifiedTime: blog.updated_at || blog.created_at,
      tags: blog.tags ? blog.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage],
      ...(twitter && { creator: twitter, site: twitter }),
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = getDb();
  let blog = null;
  try {
    blog = getBlogBySlug(db, slug);
  } catch {}
  
  if (!blog || !blog.published) notFound();
  
  recordPageView(db, `/blog/${slug}`);
  
  let content = null;
  try {
    const compiled = await compileMDX({
      source: blog.body_markdown ?? '',
      options: {
        mdxOptions: {
          remarkPlugins: [remarkGfm],
        }
      }
    });
    content = compiled.content;
  } catch (err) {
    console.error('MDX Compilation Error:', err);
    content = <p style={{ color: 'red', margin: '32px 0' }}>Error rendering content.</p>;
  }
  
  const s = getAllSettings(db);
  const site = s['site.title'] || 'Portfolio';
  const domain = s['site.domain'] || '';
  const url = domain ? `https://${domain}/blog/${slug}` : `/blog/${slug}`;
  
  let customOgImage;
  const ogImage = customOgImage || s['site.og_image_path'] || `/og?title=${encodeURIComponent(blog.title)}&kind=blog`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        headline: blog.title,
        description: blog.summary,
        image: ogImage,
        datePublished: blog.created_at,
        dateModified: blog.updated_at || blog.created_at,
        author: {
          '@type': 'Person',
          name: site,
          url: domain ? `https://${domain}` : '/',
        },
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': url,
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: domain ? `https://${domain}` : '/' },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: domain ? `https://${domain}/blog` : '/blog' },
          { '@type': 'ListItem', position: 3, name: blog.title, item: url },
        ],
      }
    ]
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdSafe(jsonLd) }} />
      <style dangerouslySetInnerHTML={{ __html: BASE_CSS }} />
      <style dangerouslySetInnerHTML={{ __html: ARTICLE_CSS }} />
      <main className="article-wrap">
        <p className="article-kicker">Blog Post</p>
        <h1 className="article-title">{blog.title}</h1>
        
        <div className="article-meta">
          <span>{new Date(blog.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          <span>{Math.max(1, Math.ceil((blog.body_markdown?.length || 0) / 1000))} min read</span>
        </div>
        
        <div className="prose">{content}</div>
        
        <div style={{ textAlign: 'center' }}>
          <a className="back-link" href="/blog">← Back to all posts</a>
        </div>
      </main>
    </>
  );
}
