import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSyncedCareerPacket } from '@/lib/synced-state';
import { getCareerPacket } from '@/lib/mcp';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  const local = getSyncedCareerPacket(db);

  if (local) {
    return NextResponse.json(local, {
      headers: { 'Cache-Control': 'public, max-age=300' },
    });
  }

  // Fall back to jobops MCP. May throw if jobops is unreachable — catch and 404.
  try {
    const packet = await getCareerPacket(db);
    if (packet && typeof packet !== 'string') {
      return NextResponse.json(packet, {
        headers: { 'Cache-Control': 'public, max-age=60' },
      });
    }
  } catch { /* jobops unreachable — fall through to 404 */ }

  return NextResponse.json(
    { error: 'No career packet available. Ask the portfolio owner to sync one via JobOps.' },
    { status: 404, headers: { 'Cache-Control': 'public, max-age=60' } },
  );
}
