import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getIronSession, type IronSession, type SessionOptions } from 'iron-session';

interface SessionData {
  admin?: boolean;
  loginAt?: number;
}

const SESSION_COOKIE = 'portfolio_admin';

function sessionOptions(): SessionOptions | null {
  const password = process.env.SESSION_SECRET;
  if (!password) return null;
  return {
    cookieName: SESSION_COOKIE,
    password,
    ttl: 60 * 60 * 24 * 14,
    cookieOptions: { httpOnly: true, sameSite: 'lax', path: '/' },
  };
}

// Paths allowed through without an admin session. The admin layout separately
// enforces the setup-completion gate (which needs DB access middleware lacks).
const ALLOW = new Set([
  '/admin/setup',
  '/admin/login',
  '/api/admin/setup',
  '/api/admin/login',
]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Forward the pathname to server components so the admin layout can do the
  // setup-completion gate (middleware runs in the edge runtime and can't open
  // the SQLite database).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', pathname);

  const isAdminPage = pathname.startsWith('/admin');
  const isAdminApi = pathname.startsWith('/api/admin');

  if (!isAdminPage && !isAdminApi) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (ALLOW.has(pathname)) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const opts = sessionOptions();
  if (!opts) {
    if (isAdminApi) {
      return NextResponse.json({ error: 'SESSION_SECRET not configured' }, { status: 503 });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/admin/login';
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  const session: IronSession<SessionData> = await getIronSession<SessionData>(
    request,
    response,
    opts,
  );
  if (session.admin !== true) {
    if (isAdminApi) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/admin/login';
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};
