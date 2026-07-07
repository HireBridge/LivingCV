import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

function csvEscape(s: string | null | undefined): string {
  if (s === null || s === undefined) return '';
  // Always quote; escape inner double quotes by doubling.
  return '"' + String(s).replace(/"/g, '""') + '"';
}

export async function GET() {
  const db = getDb();
  const rows = db
    .prepare<[], {
      id: string;
      channel: string;
      work_email: string | null;
      email_domain: string | null;
      company_domain_inferred: string | null;
      started_at: string;
      last_active_at: string | null;
      message_count: number;
      blocked_reason: string | null;
    }>('SELECT id, channel, work_email, email_domain, company_domain_inferred, started_at, last_active_at, message_count, blocked_reason FROM recruiter_sessions ORDER BY started_at DESC')
    .all();
  const header = [
    'id',
    'channel',
    'work_email',
    'email_domain',
    'company_domain',
    'started_at',
    'last_active_at',
    'message_count',
    'blocked_reason',
  ].join(',');
  const body = rows
    .map((r) =>
      [
        r.id,
        r.channel,
        r.work_email,
        r.email_domain,
        r.company_domain_inferred,
        r.started_at,
        r.last_active_at,
        String(r.message_count),
        r.blocked_reason,
      ]
        .map(csvEscape)
        .join(','),
    )
    .join('\n');
  return new Response(header + '\n' + body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
