import { getDb } from '@/lib/db';
import { listBlogs } from '@/lib/blogs';

export const dynamic = 'force-dynamic';

export default async function AdminBlogsPage() {
  const db = getDb();
type BlogEntry = { id: number; title: string; slug: string; published: number; created_at: string; };
  let blogs: BlogEntry[] = [];
  try {
    blogs = listBlogs(db) as BlogEntry[];
  } catch {
    // Table might not be ready yet
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Your Blogs</h1>
        <a href="/admin/blogs/new" className="button">Write new post</a>
      </div>
      
      <div className="admin-card">
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--rule)' }}>
              <th style={{ padding: '8px 0' }}>Title</th>
              <th style={{ padding: '8px 0' }}>Slug</th>
              <th style={{ padding: '8px 0' }}>Status</th>
              <th style={{ padding: '8px 0' }}>Date</th>
              <th style={{ padding: '8px 0', textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {blogs.map(b => (
              <tr key={b.id} style={{ borderBottom: '1px solid var(--rule)' }}>
                <td style={{ padding: '12px 0', fontWeight: 'bold' }}>{b.title}</td>
                <td style={{ padding: '12px 0', color: 'var(--ink-soft)' }}>{b.slug}</td>
                <td style={{ padding: '12px 0' }}>
                  {b.published ? <span style={{ color: 'var(--success, green)' }}>Published</span> : <span style={{ color: 'var(--ink-soft)' }}>Draft</span>}
                </td>
                <td style={{ padding: '12px 0', color: 'var(--ink-soft)' }}>{new Date(b.created_at).toLocaleDateString()}</td>
                <td style={{ padding: '12px 0', textAlign: 'right' }}>
                  <a href={`/admin/blogs/${b.id}`} className="button secondary text-sm" style={{ padding: '4px 8px', textDecoration: 'none' }}>Edit</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {blogs.length === 0 && <p style={{ marginTop: 16, color: 'var(--ink-soft)' }}>No blogs written yet.</p>}
      </div>
    </div>
  );
}
