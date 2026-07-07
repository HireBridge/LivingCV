import fs from 'node:fs';
import path from 'node:path';
import CareerDataForm from './CareerDataForm';
import { getDb } from '@/lib/db';
import { getAllSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default async function PacketPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; err?: string }> }) {
  const dataDir = process.env.DATA_DIR || './data';
  const cvPath = path.join(dataDir, 'cv.md');
  const profilePath = path.join(dataDir, 'profile.yaml');

  let cvContent = '';
  let profileContent = '';

  try {
    if (fs.existsSync(cvPath)) cvContent = fs.readFileSync(cvPath, 'utf8');
    if (fs.existsSync(profilePath)) profileContent = fs.readFileSync(profilePath, 'utf8');
  } catch (err: unknown) {
    console.error('Failed to read career data:', err);
  }

  const sp = await searchParams;
  const db = getDb();
  const all = getAllSettings(db);

  return (
    <div>
      <h1>Career Data</h1>
      <p>
        Seed your raw career data here. The jobops MCP uses these files to generate your career packet dynamically.
      </p>

      {sp.saved === 'resume' ? <div className="flash success" style={{ marginBottom: 16 }}>Resume uploaded successfully!</div> : null}
      {sp.saved === '1' ? <div className="flash success" style={{ marginBottom: 16 }}>Career data saved successfully!</div> : null}
      {sp.error ? <div className="flash error" style={{ marginBottom: 16 }}>{sp.error}</div> : null}
      {sp.err ? <div className="flash error" style={{ marginBottom: 16 }}>Upload failed: {sp.err}</div> : null}

      <section className="admin-card" style={{ marginBottom: 32 }}>
        <h3>Resume (PDF)</h3>
        <p>Uploaded to the data dir; served at <code>/resume</code>.</p>
        <p>
          Current:{' '}
          {all['resume.filename'] ? (
            <a href="/resume" target="_blank" rel="noopener noreferrer">
              <code>{all['resume.filename']}</code>
            </a>
          ) : (
            <em style={{ color: 'var(--ink-soft)' }}>none uploaded yet</em>
          )}
        </p>
        <form method="post" action="/api/admin/resume" encType="multipart/form-data">
          <input type="hidden" name="redirect" value="/admin/packet" />
          <div className="row" style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 16 }}>
            <input type="file" name="resume" accept="application/pdf" required style={{ flex: 1 }} />
            <button type="submit">Upload Resume</button>
          </div>
        </form>
      </section>

      <CareerDataForm initialCv={cvContent} initialProfile={profileContent} />
    </div>
  );
}
