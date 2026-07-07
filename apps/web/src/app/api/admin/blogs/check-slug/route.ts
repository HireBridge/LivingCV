import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');
  const excludeId = url.searchParams.get('excludeId');

  if (!slug) {
    return NextResponse.json({ available: false });
  }

  const db = getDb();
  
  let query = 'SELECT id FROM blogs WHERE slug = ?';
  const params: any[] = [slug];

  if (excludeId) {
    query += ' AND id != ?';
    params.push(parseInt(excludeId, 10));
  }

  const row = db.prepare(query).get(...params);

  return NextResponse.json({ available: !row });
}
