'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import 'easymde/dist/easymde.min.css';

// Dynamically import SimpleMdeReact so it only loads on the client side
const SimpleMdeReact = dynamic(() => import('react-simplemde-editor'), { ssr: false });

function generateRandomSlug() {
  return 'post-' + Math.random().toString(36).substring(2, 10);
}

type BlogData = {
  id?: number | string;
  title?: string;
  slug?: string;
  summary?: string;
  body_markdown?: string;
  tags?: string;
  published?: number;
};

export default function BlogForm({ blog }: { blog: BlogData }) {
  const [markdown, setMarkdown] = useState(blog.body_markdown || '');
  const [slug, setSlug] = useState(blog.slug || (!blog.id ? generateRandomSlug() : ''));
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (!slug) {
      setSlugAvailable(null);
      return;
    }
    
    const timeoutId = setTimeout(() => {
      let url = `/api/admin/blogs/check-slug?slug=${encodeURIComponent(slug)}`;
      if (blog.id) {
        url += `&excludeId=${blog.id}`;
      }
      fetch(url)
        .then(res => res.json())
        .then(data => setSlugAvailable(data.available))
        .catch(() => setSlugAvailable(null));
    }, 300); // debounce 300ms

    return () => clearTimeout(timeoutId);
  }, [slug, blog.id]);
  
  return (
    <form method="post" action="/api/admin/blogs/save" className="admin-card">
      {blog.id && <input type="hidden" name="id" value={blog.id} />}
      
      <div className="row">
        <label>Title</label>
        <input name="title" defaultValue={blog.title} required placeholder="e.g. How I built my AI agent" />
      </div>
      
      <div className="row">
        <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>URL Slug (unique)</span>
          {slug && slugAvailable !== null && (
            <span style={{ 
              fontSize: '0.85rem', 
              color: slugAvailable ? 'var(--success, green)' : 'red',
              fontWeight: 'bold',
              background: slugAvailable ? '#e6ffe6' : '#ffe6e6',
              padding: '2px 8px',
              borderRadius: '12px'
            }}>
              {slugAvailable ? '✓ Available' : '✗ Unavailable'}
            </span>
          )}
        </label>
        <input 
          name="slug" 
          value={slug} 
          onChange={(e) => setSlug(e.target.value)} 
          required 
          placeholder="how-i-built-ai" 
        />
      </div>
      
      <div className="row">
        <label>Summary (shown in the list)</label>
        <textarea name="summary" defaultValue={blog.summary} required style={{ minHeight: 80 }} />
      </div>

      <div className="row">
        <label>Hashtags (comma separated)</label>
        <input name="tags" defaultValue={blog.tags || ''} placeholder="e.g. react, nextjs, ai" />
      </div>

      
      <div className="row">
        <label>Content</label>
        <input type="hidden" name="body_markdown" value={markdown} />
        <div style={{ backgroundColor: 'white', borderRadius: '4px' }}>
          <SimpleMdeReact 
            value={markdown} 
            onChange={setMarkdown} 
            options={{
              spellChecker: false,
              minHeight: '400px',
              placeholder: "Write your post here in Markdown...",
              status: ['lines', 'words', 'cursor'],
            }}
          />
        </div>
      </div>
      
      <div className="row" style={{ marginTop: 24 }}>
        <label>
          <input type="checkbox" name="published" value="1" defaultChecked={blog.published === 1} style={{ marginRight: 8 }} />
          Publish (uncheck to retract/disable)
        </label>
      </div>
      
      <div className="actions" style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 24 }}>
        <div>
          <button type="submit" disabled={slugAvailable === false}>Save Blog</button>
          <a href="/admin/blogs" className="button secondary" style={{ marginLeft: 10, textDecoration: 'none' }}>Cancel</a>
        </div>
        {blog.id && (
          <button type="submit" formAction="/api/admin/blogs/delete" className="button secondary" style={{ color: 'red', borderColor: 'red' }} onClick={(e) => {
            if(!confirm('Are you sure you want to delete this blog?')) e.preventDefault();
          }}>
            Delete Blog
          </button>
        )}
      </div>
    </form>
  );
}
