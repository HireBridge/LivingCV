import { timingSafeEqual } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { CareerPacketSchema } from '@livingcv/shared';
import { getDb } from '@/lib/db';
import { decideJobOpsImportChanges, listJobOpsImportChanges } from '@/lib/jobops-import';

function authorized(request: Request): boolean {
  const expected = (process.env.JOBOPS_INTERNAL_SYNC_SECRET || '').trim();
  const actual = request.headers.get('x-jobops-sync-secret') || '';
  if (!expected || expected.length !== actual.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null) as { packet?: unknown; approved_by_user?: boolean; proposal_id?: string } | null;
  const parsed = CareerPacketSchema.safeParse(body?.packet);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid career packet', details: parsed.error.flatten() }, { status: 400 });

  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO synced_state (key, value, source, synced_at) VALUES ('career_packet', ?, 'jobops', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, source = excluded.source, synced_at = excluded.synced_at`,
  ).run(JSON.stringify(parsed.data), now);

  let published = 0;
  if (body?.approved_by_user === true && body.proposal_id) {
    const preview = listJobOpsImportChanges(db);
    const pendingIds = preview?.changes.filter((change) => change.decision === 'pending').map((change) => change.id) ?? [];
    published = decideJobOpsImportChanges(db, pendingIds, 'approved');
    db.prepare(
      `INSERT INTO synced_state (key, value, source, synced_at) VALUES ('career_packet_last_approval', ?, 'jobops', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, source = excluded.source, synced_at = excluded.synced_at`,
    ).run(JSON.stringify({ proposalId: body.proposal_id, published, approvedAt: now }), now);
    revalidatePath('/');
    revalidatePath('/admin/packet');
  }
  return NextResponse.json({ stored: true, approved: body?.approved_by_user === true, published, synced_at: now });
}
