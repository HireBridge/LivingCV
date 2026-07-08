import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { SETTING_KEYS } from '@livingcv/shared';

// Caddy `forward_auth` target for /mcp/public. Caddy calls this before proxying
// a public-MCP request to jobops: a 2xx here lets the request through, anything
// else denies it. This is how the admin "Public MCP" toggle actually closes the
// external endpoint — without any app code touching the MCP stream itself.
//
// Note: the recruiter chat agent reaches jobops's /mcp/public over the internal
// docker network (not through Caddy), so disabling the public endpoint here does
// NOT affect the on-site concierge — only external/third-party access.
function check(): NextResponse {
  const db = getDb();
  const enabled = (getSetting(db, SETTING_KEYS.publicMcpEnabled) ?? '0') === '1';
  return enabled
    ? new NextResponse(null, { status: 200 })
    : new NextResponse('Public MCP is disabled', { status: 403 });
}

export const dynamic = 'force-dynamic';
export function GET() { return check(); }
export function POST() { return check(); }
