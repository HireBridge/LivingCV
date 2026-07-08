import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { SETTING_KEYS } from '@livingcv/shared';
import { verifyHireBridgeSignature } from '@/lib/hirebridge-signature';
import { getMcpClient } from '@/lib/mcp';

// The shared-secret HMAC model below is a stub pending a real HireBridge spec.
// In production, signature verification should use the protocol documented by
// the HireBridge federation contract (key rotation, replay protection, etc.).

// Intentionally public and protected by HMAC signature verification only.
// Not gated by admin session — this is a server-to-server endpoint.
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const db = getDb();

  // Check HireBridge is connected.
  if (getSetting(db, SETTING_KEYS.hirebridgeConnected) !== '1') {
    return NextResponse.json({ error: 'HireBridge is not connected.' }, { status: 403 });
  }

  const token = getSetting(db, SETTING_KEYS.hirebridgeToken);
  if (!token) {
    return NextResponse.json({ error: 'HireBridge token not configured.' }, { status: 403 });
  }

  const bodyText = await request.text();
  const signature = request.headers.get('X-HireBridge-Signature');

  // Verify HMAC signature.
  if (!verifyHireBridgeSignature(token, bodyText, signature)) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  // Parse and validate payload.
  let payload: {
    request_id?: string;
    candidate_id?: string;
    recruiter_identity?: { name?: string; email?: string; company?: string };
    ts?: string;
  };
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!payload.request_id || !payload.candidate_id || !payload.recruiter_identity) {
    return NextResponse.json({ error: 'Missing required fields: request_id, candidate_id, recruiter_identity.' }, { status: 400 });
  }

  // Verify candidate_id matches this portfolio's client_id.
  const clientId = getSetting(db, SETTING_KEYS.hirebridgeClientId) || '';
  if (payload.candidate_id !== clientId) {
    return NextResponse.json({ error: 'candidate_id mismatch.' }, { status: 403 });
  }

  const { email, name } = payload.recruiter_identity;

  // Push the recruiter to JobOps via add_contacts.
  try {
    const mcp = await getMcpClient(db);
    try {
      await mcp.client.callTool({
        name: 'add_contacts',
        arguments: {
          contacts: [{
            full_name: name || email?.split('@')[0] || '',
            email: email || '',
            notes: `Introduction request via HireBridge, request_id: ${payload.request_id}`,
          }],
        },
      });
    } finally {
      await mcp.close();
    }
  } catch (e) {
    console.warn('[inbox] failed to sync introduction to jobops', e instanceof Error ? e.message : e);
    // Don't return an error to HireBridge — the introduction was received, the
    // local sync is best-effort.
  }

  return NextResponse.json({ ok: true, request_id: payload.request_id });
}
