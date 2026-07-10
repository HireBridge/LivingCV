import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Tombstone for the pre-contract self-callback flow. The current connect
// flow uses HireBridge's device-auth endpoint and does not call back into
// this site. This route is kept as a 410 pointer so any stale link in
// email/chat history directs the admin to the new flow.
export async function GET() {
  return new NextResponse(
    'The HireBridge connection flow no longer uses a self-callback. ' +
    'In the admin UI: Settings → MCP → click "Connect to HireBridge" again.',
    { status: 410, headers: { 'content-type': 'text/plain; charset=utf-8' } },
  );
}