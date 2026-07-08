import { NextResponse } from 'next/server';
import { externalBase } from '@/lib/http';
import { getDb } from '@/lib/db';
import { getSetting } from '@/lib/settings';

export async function POST(request: Request) {
  const db = getDb();
  const form = await request.formData();
  const provider = String(form.get('agent.llm_provider') || '');
  let apiKey = String(form.get('agent.llm_api_key') || '').trim();

  const isJson = request.headers.get('accept')?.includes('application/json');

  if (apiKey.startsWith('••••')) {
    apiKey = getSetting(db, 'agent.llm_api_key') || '';
  }

  if (!apiKey) {
    if (isJson) return NextResponse.json({ success: false, error: 'API key is missing' }, { status: 400 });
    return NextResponse.redirect(new URL('/admin/settings?tab=connections&test_error=API key is missing', externalBase(request)), { status: 303 });
  }

  try {
    let res;
    if (provider === 'openai') {
      res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    } else if (provider === 'deepseek') {
      res = await fetch('https://api.deepseek.com/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    } else if (provider === 'anthropic') {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hello' }],
        }),
      });
    } else if (provider === 'gemini') {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    } else {
      if (isJson) return NextResponse.json({ success: false, error: 'Unknown provider' }, { status: 400 });
      return NextResponse.redirect(new URL('/admin/settings?tab=connections&test_error=Unknown provider', externalBase(request)), { status: 303 });
    }

    if (!res.ok) {
      const text = await res.text();
      const errStr = `Test failed (${res.status}): ${text.substring(0, 100)}`;
      if (isJson) return NextResponse.json({ success: false, error: errStr }, { status: 400 });
      return NextResponse.redirect(new URL(`/admin/settings?tab=connections&test_error=${encodeURIComponent(errStr)}`, externalBase(request)), { status: 303 });
    }

    if (isJson) return NextResponse.json({ success: true });
    return NextResponse.redirect(new URL('/admin/settings?tab=connections&test_success=1', externalBase(request)), { status: 303 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isJson) return NextResponse.json({ success: false, error: `Network error: ${msg}` }, { status: 400 });
    return NextResponse.redirect(new URL(`/admin/settings?tab=connections&test_error=Network error: ${encodeURIComponent(msg)}`, externalBase(request)), { status: 303 });
  }
}
