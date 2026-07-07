'use client';

import { useState } from 'react';

export default function CareerDataForm({
  initialCv,
  initialProfile,
}: {
  initialCv: string;
  initialProfile: string;
}) {
  const [cv, setCv] = useState(initialCv);
  const [profile, setProfile] = useState(initialProfile);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (typeof ev.target?.result === 'string') {
        setter(ev.target.result);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset so they can upload the same file again if needed
  };

  return (
    <form method="post" action="/api/admin/packet" className="admin-card">
      <div className="row">
        <label>cv.md (Markdown format)</label>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
          <a href="/templates/cv.md" download className="secondary" style={{ padding: '4px 10px', border: '1px solid var(--rule)', borderRadius: 4, textDecoration: 'none', color: 'var(--ink)', fontSize: '0.85rem' }}>
            ↓ Download Template
          </a>
          <span style={{ fontSize: '0.85rem', color: 'var(--ink-soft)' }}>or upload filled file:</span>
          <input 
            type="file" 
            accept=".md,.txt" 
            onChange={(e) => handleFileUpload(e, setCv)} 
            style={{ width: 'auto', padding: '2px', border: 'none', background: 'transparent' }} 
          />
        </div>
        <textarea 
          name="cv_md" 
          value={cv}
          onChange={(e) => setCv(e.target.value)}
          style={{ minHeight: 300, fontFamily: 'monospace' }}
          placeholder="# Work Experience&#10;..."
        />
      </div>

      <div className="row" style={{ marginTop: 24 }}>
        <label>profile.yaml (YAML format)</label>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
          <a href="/templates/profile.yaml" download className="secondary" style={{ padding: '4px 10px', border: '1px solid var(--rule)', borderRadius: 4, textDecoration: 'none', color: 'var(--ink)', fontSize: '0.85rem' }}>
            ↓ Download Template
          </a>
          <span style={{ fontSize: '0.85rem', color: 'var(--ink-soft)' }}>or upload filled file:</span>
          <input 
            type="file" 
            accept=".yaml,.yml,.txt" 
            onChange={(e) => handleFileUpload(e, setProfile)} 
            style={{ width: 'auto', padding: '2px', border: 'none', background: 'transparent' }} 
          />
        </div>
        <textarea 
          name="profile_yaml" 
          value={profile}
          onChange={(e) => setProfile(e.target.value)}
          style={{ minHeight: 300, fontFamily: 'monospace' }}
          placeholder="name: Alex Rivera&#10;role: Engineer&#10;..."
        />
      </div>

      <div className="actions" style={{ marginTop: 24 }}>
        <button type="submit">Save Career Data</button>
      </div>
    </form>
  );
}
