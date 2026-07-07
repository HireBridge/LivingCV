import { getDb } from '@/lib/db';
import { getBlogById } from '@/lib/blogs';
import { notFound } from 'next/navigation';
import BlogForm from './BlogForm';

export const dynamic = 'force-dynamic';

export default async function EditBlogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  
  let blog = { id: '', title: '', slug: '', summary: '', body_markdown: '', published: 0 };
  
  if (id !== 'new') {
    const existing = getBlogById(db, parseInt(id, 10));
    if (!existing) notFound();
    blog = { ...existing, id: existing.id.toString() };
  }

  return (
    <div>
      <h1>{id === 'new' ? 'Write new blog' : 'Edit blog'}</h1>
      <BlogForm blog={blog} />
    </div>
  );
}
