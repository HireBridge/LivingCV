import { getDb } from '@/lib/db';
import { listBlogs } from '@/lib/blogs';
import { getAllSettings } from '@/lib/settings';
import { BASE_CSS } from '@/templates/classic/styles';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const db = getDb();
  const s = getAllSettings(db);
  const domain = s['site.domain'] || '';
  const site = s['site.title'] || s['site.domain'] || 'Portfolio';
  const url = domain ? `https://${domain}/blog` : `/blog`;
  const twitter = s['site.twitter_handle'] || '';
  const ogImage = s['site.og_image_path'] || `/og?title=${encodeURIComponent('Blog')}`;
  const description = 'Thoughts, tutorials, and engineering deep-dives.';

  return {
    title: { absolute: `Blog · ${site}` },
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `Blog · ${site}`,
      description,
      url,
      siteName: site,
      type: 'website',
      images: [ogImage],
      locale: s['site.lang'] || 'en',
    },
    twitter: {
      card: 'summary_large_image',
      title: `Blog · ${site}`,
      description,
      images: [ogImage],
      ...(twitter && { creator: twitter, site: twitter }),
    }
  };
}

export default async function BlogIndexPage({ searchParams }: { searchParams: Promise<{ q?: string; tag?: string }> }) {
  const sp = await searchParams;
  const q = sp.q?.toLowerCase() || '';
  const tag = sp.tag?.toLowerCase() || '';
  const db = getDb();
  type BlogListEntry = { id: number; slug: string; title: string; summary: string; tags: string | null; created_at: string; };
  let blogs: BlogListEntry[] = [];
  try {
    blogs = listBlogs(db, true) as BlogListEntry[]; // true = published only
  } catch {
    // Migration not run yet
  }

  let filtered = blogs;
  if (q) {
    filtered = filtered.filter(b => b.title.toLowerCase().includes(q) || b.summary.toLowerCase().includes(q));
  }
  if (tag) {
    filtered = filtered.filter(b => b.tags && b.tags.split(',').map((t: string) => t.trim().toLowerCase()).includes(tag));
  }

  const allTags = new Set<string>();
  blogs.forEach(b => {
    if (b.tags) {
      b.tags.split(',').forEach((t: string) => {
        const trimmed = t.trim().toLowerCase();
        if (trimmed) allTags.add(trimmed);
      });
    }
  });
  const uniqueTags = Array.from(allTags).sort();

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: BASE_CSS }} />
      <style dangerouslySetInnerHTML={{ __html: `
        .blog-header { max-width: 800px; margin: 60px auto 40px; padding: 0 24px; }
        .blog-header h1 { font-family: 'Space Grotesk', sans-serif; font-size: 3rem; margin: 0; }
        .blog-header p { font-size: 1.2rem; color: var(--ink-soft); margin-top: 8px; }
        .blog-list { max-width: 800px; margin: 0 auto; padding: 0 24px 80px; display: flex; flex-direction: column; gap: 40px; }
        .blog-card { text-decoration: none; display: block; border-bottom: 1px solid var(--rule); padding-bottom: 30px; }
        .blog-card:hover h2 { color: var(--signal); }
        .blog-card h2 { font-family: 'Space Grotesk', sans-serif; font-size: 1.8rem; color: var(--ink); margin: 0 0 10px; transition: color 0.2s; }
        .blog-card p.summary { font-family: 'Source Serif 4', Georgia, serif; font-size: 1.1rem; color: var(--ink-soft); line-height: 1.5; margin: 0 0 12px; }
        .blog-card .meta { font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; color: var(--ink-soft); text-transform: uppercase; display: flex; gap: 16px; align-items: center; }
        .blog-card .meta .tags { display: flex; gap: 8px; color: var(--signal); }
        .back-nav { max-width: 800px; margin: 40px auto 0; padding: 0 24px; font-family: 'JetBrains Mono', monospace; font-size: 0.9rem; }
        .back-nav a { color: var(--signal); text-decoration: none; }
        .back-nav a:hover { text-decoration: underline; }
        
        .blog-filters { max-width: 800px; margin: 0 auto 40px; padding: 0 24px; }
        .search-form { display: flex; gap: 10px; margin-bottom: 20px; align-items: center; }
        .search-form input { flex: 1; max-width: 400px; padding: 10px 14px; border: 1px solid var(--rule); border-radius: 6px; font-family: inherit; font-size: 1rem; }
        .search-form button { padding: 10px 20px; background: var(--ink); color: var(--paper); border: none; border-radius: 6px; font-weight: 600; cursor: pointer; }
        .clear-filter { color: var(--rust); text-decoration: none; font-size: 0.9rem; font-family: 'JetBrains Mono', monospace; }
        .clear-filter:hover { text-decoration: underline; }
        .tag-cloud { display: flex; flex-wrap: wrap; gap: 8px; }
        .tag { text-decoration: none; font-family: 'JetBrains Mono', monospace; font-size: 0.85rem; padding: 4px 10px; border: 1px solid var(--rule); border-radius: 20px; color: var(--ink-soft); transition: all 0.2s; }
        .tag:hover { border-color: var(--signal); color: var(--signal); }
        .tag.active { background: var(--signal); color: var(--paper); border-color: var(--signal); }
      `}} />
      
      <div className="back-nav">
        <a href="/">← Back to portfolio</a>
      </div>

      <header className="blog-header">
        <h1>Blog</h1>
        <p>Thoughts, tutorials, and engineering deep-dives.</p>
      </header>
      <div className="blog-filters">
        <form method="get" action="/blog" className="search-form">
          <input type="text" name="q" defaultValue={q} placeholder="Search blogs by title or summary..." />
          {tag && <input type="hidden" name="tag" value={tag} />}
          <button type="submit">Search</button>
          {(q || tag) && <a href="/blog" className="clear-filter">Clear Filters</a>}
        </form>
        {uniqueTags.length > 0 && (
          <div className="tag-cloud">
            {uniqueTags.map(t => (
              <a key={t} href={`/blog?tag=${encodeURIComponent(t)}${q ? `&q=${encodeURIComponent(q)}` : ''}`} className={`tag ${t === tag ? 'active' : ''}`}>
                #{t}
              </a>
            ))}
          </div>
        )}
      </div>
      
      <main className="blog-list">
        {filtered.length === 0 ? (
          <p style={{ color: 'var(--ink-soft)' }}>No posts found.</p>
        ) : (
          filtered.map(b => (
            <a key={b.id} href={`/blog/${b.slug}`} className="blog-card">
              <h2>{b.title}</h2>
              <p className="summary">{b.summary}</p>
              <div className="meta">
                <span>{new Date(b.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                {b.tags && (
                  <div className="tags">
                    {b.tags.split(',').map((t: string) => t.trim()).filter(Boolean).map((t: string) => (
                      <span key={t}>#{t}</span>
                    ))}
                  </div>
                )}
              </div>
            </a>
          ))
        )}
      </main>
    </>
  );
}
