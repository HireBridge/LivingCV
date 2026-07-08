import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session.admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get('q') || '';
  const beforeId = searchParams.get('before') ? parseInt(searchParams.get('before')!, 10) : Number.MAX_SAFE_INTEGER;
  const limit = 50;

  try {
    const db = await getDb();
    let query = 'SELECT * FROM system_logs WHERE id < ? ';
    const params: (string | number)[] = [beforeId];
    
    if (search) {
      query += 'AND message LIKE ? ';
      params.push(`%${search}%`);
    }
    
    query += 'ORDER BY id DESC LIMIT ?';
    params.push(limit);

    const logs = db.prepare(query).all(...params);
    return NextResponse.json({ logs });
  } catch (e) {
    console.error('Failed to fetch system logs:', e);
    // If the table doesn't exist yet, return empty
    return NextResponse.json({ logs: [] });
  }
}
