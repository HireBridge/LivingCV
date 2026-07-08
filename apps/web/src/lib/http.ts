// Build the public-facing base URL for redirects. Behind the Caddy reverse
// proxy, `request.url` reflects the internal origin (http://web:3000 /
// localhost), so redirects built from it send the browser to the wrong host.
// Caddy sets X-Forwarded-Proto/Host to the real public values — use those.
export function externalBase(request: Request): string {
  const h = request.headers;
  const proto = (h.get('x-forwarded-proto')?.split(',')[0] || '').trim()
    || new URL(request.url).protocol.replace(':', '')
    || 'https';
  const host = (h.get('x-forwarded-host')?.split(',')[0] || '').trim()
    || h.get('host')
    || new URL(request.url).host;
  return `${proto}://${host}`;
}
