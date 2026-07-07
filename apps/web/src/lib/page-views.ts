import type { Db } from '@livingcv/db';

// Cookieless, server-side page-view counter (§12 feature 2). Increments a
// (path, day) row; no cookies, no external service, no per-visitor tracking.
export function recordPageView(db: Db, path: string): void {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  // UPSERT the (path, day) counter.
  db.prepare(
    `INSERT INTO page_views (path, day, count) VALUES (?, ?, 1)
     ON CONFLICT(path, day) DO UPDATE SET count = count + 1`,
  ).run(path, day);
}

export interface PageViewSeries {
  day: string;
  count: number;
}

// Last `days` days of total views across all paths, for the admin sparkline.
export function getViewSeries(db: Db, days = 30): PageViewSeries[] {
  const rows = db
    .prepare<[string], { day: string; count: number }>(
      `SELECT day, SUM(count) AS count FROM page_views
       WHERE day >= date('now', ?) GROUP BY day ORDER BY day ASC`,
    )
    .all(`-${days} day`);
  return rows.map((r) => ({ day: r.day, count: r.count }));
}

export function getTotalViews(db: Db): number {
  const row = db.prepare<[], { n: number }>('SELECT COALESCE(SUM(count), 0) AS n FROM page_views').get()!;
  return row.n;
}

export function getViewsToday(db: Db): number {
  const day = new Date().toISOString().slice(0, 10);
  const row = db
    .prepare<[string], { n: number }>('SELECT COALESCE(SUM(count), 0) AS n FROM page_views WHERE day = ?')
    .get(day)!;
  return row.n;
}
