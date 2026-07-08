import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { getSetting } from '@/lib/settings';
import { SETTING_KEYS } from '@livingcv/shared';

// Compares the running instance (its build-time commit stamp) against the
// upstream repo on GitHub and reports whether updates are available. Read-only:
// it never modifies anything. Applying updates is done on the host with
// scripts/update.sh — the admin panel only tells you if/what to update.

const DEFAULT_REPO = 'mohith-das/LivingCV';
const DEFAULT_BRANCH = 'main';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  if (!session.admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getDb();
  const current = (process.env.LIVINGCV_COMMIT || 'dev').trim();
  const repo = (getSetting(db, SETTING_KEYS.updatesRepo) || DEFAULT_REPO).trim();
  const branch = (getSetting(db, SETTING_KEYS.updatesBranch) || DEFAULT_BRANCH).trim();
  const ghHeaders = { accept: 'application/vnd.github+json', 'user-agent': 'livingcv-updater' };

  try {
    const latestRes = await fetch(
      `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(branch)}`,
      { headers: ghHeaders, signal: AbortSignal.timeout(8000) },
    );
    if (!latestRes.ok) {
      const hint = latestRes.status === 404 ? 'repo or branch not found' : `GitHub returned ${latestRes.status}`;
      return NextResponse.json({ error: `Could not check updates (${hint}).`, repo, branch, current }, { status: 200 });
    }
    const latest = await latestRes.json();
    const latestSha: string = latest.sha ?? '';
    const latestShort = latestSha.slice(0, 7);
    const latestDate: string = latest.commit?.author?.date ?? latest.commit?.committer?.date ?? '';
    const latestMessage: string = (latest.commit?.message ?? '').split('\n')[0];
    const repoUrl = `https://github.com/${repo}`;

    // Unknown local commit (image not stamped) — can't diff, just report latest.
    if (!current || current === 'dev') {
      return NextResponse.json({
        current: 'unknown', latestShort, latestDate, latestMessage, repo, branch, repoUrl,
        upToDate: false, unknownCurrent: true,
      });
    }

    let behind: number | null = null;
    let upToDate = current === latestShort || current === latestSha;
    try {
      const cmpRes = await fetch(
        `https://api.github.com/repos/${repo}/compare/${current}...${encodeURIComponent(branch)}`,
        { headers: ghHeaders, signal: AbortSignal.timeout(8000) },
      );
      if (cmpRes.ok) {
        const cmp = await cmpRes.json();
        behind = typeof cmp.ahead_by === 'number' ? cmp.ahead_by : null; // commits head is ahead of us
        upToDate = cmp.status === 'identical' || behind === 0;
      }
    } catch {
      /* compare is best-effort; fall back to sha equality above */
    }

    return NextResponse.json({
      current, latestShort, latestDate, latestMessage, repo, branch, repoUrl, behind, upToDate,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Update check failed: ${msg}`, repo, branch, current }, { status: 200 });
  }
}
