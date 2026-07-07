import { getDb } from '@/lib/db';
import { getAllSettings, getSetting } from '@/lib/settings';
import { listProjects, listCaseStudies, getActiveTemplateSlug } from '@/lib/content';
import { getTotalViews, getViewsToday, getViewSeries } from '@/lib/page-views';
import { SETTING_KEYS } from '@livingcv/shared';

export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  const db = getDb();
  const settings = getAllSettings(db);
  const projects = listProjects(db);
  const caseStudies = listCaseStudies(db);
  const slug = getActiveTemplateSlug(db);
  const totalViews = getTotalViews(db);
  const today = getViewsToday(db);
  const series = getViewSeries(db, 30);
  const agentEnabled = (settings[SETTING_KEYS.agentEnabled] || '1') === '1';
  const voiceEnabled = (settings[SETTING_KEYS.voiceEnabled] || '0') === '1';
  const gateEnabled = (settings[SETTING_KEYS.gateEnabled] || '1') === '1';
  const resume = getSetting(db, SETTING_KEYS.resumeFilename);
  const max = Number(settings[SETTING_KEYS.limitsDailyMessageBudget] ?? '500');
  return (
    <div>
      <h1>Dashboard</h1>


      <section className="admin-card">
        <h3>Overview</h3>
        <p>
          Active template: <strong>{slug}</strong> · Projects:{' '}
          <strong>{projects.length}</strong> · Published case studies:{' '}
          <strong>{caseStudies.filter((c) => c.published === 1).length}</strong>
        </p>
      </section>

      <section className="admin-card">
        <h3>Page views ({totalViews.toLocaleString()} total · {today.toLocaleString()} today)</h3>
        {series.length > 0 ? (
          <Sparkline series={series} />
        ) : (
          <p>No page views recorded yet.</p>
        )}
      </section>

      <section className="admin-card">
        <h3>Kill switches</h3>
        <p>
          <strong>Agent:</strong> {agentEnabled ? 'on' : 'off'} ·{' '}
          <strong>Voice:</strong> {voiceEnabled ? 'on' : 'off'} ·{' '}
          <strong>Email gate:</strong> {gateEnabled ? 'on' : 'off'}
        </p>
        <p>Toggle these in <a href="/admin/settings">Settings</a>.</p>
      </section>

      <section className="admin-card">
        <h3>Daily message budget</h3>
        <p>
          {max.toLocaleString()} messages/day across all recruiter sessions
          (protects your BYOK LLM spend; the orchestrator enforces it once wired in Phase 2).
        </p>
      </section>

      <section className="admin-card">
        <h3>Resume</h3>
        <p>
          {resume ? (
            <>
              Uploaded file: <code>{resume}</code>{' '}
              <a href={`/resume`} target="_blank" rel="noopener noreferrer">
                view
              </a>
            </>
          ) : (
            <>No resume uploaded yet. Upload one in <a href="/admin/packet">Career Data</a>.</>
          )}
        </p>
      </section>
    </div>
  );
}

function Sparkline({ series }: { series: { day: string; count: number }[] }) {
  const width = 540;
  const height = 80;
  const padding = 8;
  const max = Math.max(1, ...series.map((p) => p.count));
  const stepX = series.length > 1 ? (width - padding * 2) / (series.length - 1) : 0;
  const points = series
    .map((p, i) => {
      const x = padding + i * stepX;
      const y = height - padding - (p.count / max) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', maxWidth: width }}>
      <polyline
        points={points}
        fill="none"
        stroke="var(--ink)"
        strokeWidth={1.4}
      />
    </svg>
  );
}
