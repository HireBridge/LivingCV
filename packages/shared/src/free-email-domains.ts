// Bundled denylist of free / personal / disposable email domains.
//
// The recruiter email gate (§7) rejects a work email whose domain matches any
// entry here. Entries are either exact domains ("gmail.com") or wildcard
// suffixes ("yahoo.*" -> any TLD under yahoo, e.g. yahoo.com, yahoo.co.uk).
//
// This list is auditable and the single source of truth for the built-in
// denylist; it is seeded into the `disposable_domains` table at first
// migration (source = 'builtin') and the admin can add more rows from
// /admin/settings. Admin-added rows are exact domains by convention but the
// matcher handles wildcards there too.
//
// Free providers: the major consumer mail hosts. Disposables: the common
// throwaway/10-minute services. Keep this conservative — the gate is heuristic
// and lossy by design (§1 decision 3); better to let a borderline domain
// through than to block a real recruiter at a small company.

export const FREE_EMAIL_DOMAINS: readonly string[] = [
  // ── Major free / personal providers ──
  'gmail.com',
  'googlemail.com',
  'yahoo.*',
  'outlook.com',
  'hotmail.*',
  'live.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.*',
  'mail.com',
  'zoho.com',
  'yandex.*',

  // ── Disposable / throwaway providers ──
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.info',
  'guerrillamail.net',
  'guerrillamailblock.com',
  '10minutemail.com',
  '10minutemail.net',
  'temp-mail.org',
  'tempmail.com',
  'yopmail.com',
  'yopmail.net',
  'sharklasers.com',
  'dispostable.com',
  'fakeinbox.com',
  'maildrop.cc',
  'getnada.com',
  'nada.email',
  'trashmail.com',
  'throwawaymail.com',
  'tempinbox.com',
  'mailnesia.com',
  'discard.email',
  'spambog.com',
  'spam4.me',
];

// A domain `d` (already lowercased, extracted from the email's host part) is
// denied if it matches any pattern. A pattern ending in `.*` matches any
// domain whose first label equals the pattern's base (e.g. "yahoo.*" matches
// "yahoo.com" and "yahoo.co.uk" but not "myyahoo.com"). Any other pattern is an
// exact, case-insensitive match.
export function isDomainDenied(domain: string, patterns: readonly string[]): boolean {
  const d = domain.toLowerCase().trim();
  if (!d) return false;
  for (const p of patterns) {
    const pat = p.toLowerCase().trim();
    if (!pat) continue;
    if (pat.endsWith('.*')) {
      const base = pat.slice(0, -2);
      if (base && d.startsWith(base + '.')) return true;
    } else if (d === pat) {
      return true;
    }
  }
  return false;
}
