'use client';

import type { SectionLabels } from '@livingcv/shared';

const SECTIONS = [
  { id: 'projects', defaultKicker: '01 — Selected work', defaultTitle: 'Projects', defaultNavLabel: 'Projects' },
  { id: 'alsoShipped', defaultKicker: '02 — Also shipped', defaultTitle: 'Smaller tools', defaultNavLabel: 'Also Shipped' },
  { id: 'background', defaultKicker: '03 — Before this', defaultTitle: 'Background', defaultNavLabel: 'Background' },
  { id: 'signals', defaultKicker: 'Signals', defaultTitle: 'Signals', defaultNavLabel: 'Signals' },
  { id: 'contact', defaultKicker: 'Get in touch', defaultTitle: 'Contact', defaultNavLabel: 'Contact' },
];

export function LabelsTab({ slug, initialLabels }: { slug: string; initialLabels: SectionLabels }) {
  return (
    <section className="admin-card">
      <h3>Section Labels</h3>
      <form method="post" action="/api/admin/content/save">
        <input type="hidden" name="template_slug" value={slug} />
        <input type="hidden" name="section" value="section_labels" />
        
        <p style={{ color: 'var(--ink-soft)', marginBottom: 20 }}>
          Override the static kicker (eyebrow), title, and navigation bar label for the built-in sections. 
          Leave a field blank to use its default value.
        </p>

        {SECTIONS.map((sec) => (
          <div key={sec.id} style={{ marginBottom: 24, paddingBottom: 24, borderBottom: '1px solid var(--rule)' }}>
            <h4 style={{ marginBottom: 12, fontSize: '1rem' }}>{sec.defaultTitle} <span style={{ fontWeight: 400, color: 'var(--ink-soft)', fontSize: '0.85rem' }}>({sec.id})</span></h4>
            <div className="row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <div>
                <label>Kicker</label>
                <input name={`${sec.id}_kicker`} defaultValue={initialLabels[sec.id]?.kicker ?? ''} placeholder={sec.defaultKicker} />
              </div>
              <div>
                <label>Title</label>
                <input name={`${sec.id}_title`} defaultValue={initialLabels[sec.id]?.title ?? ''} placeholder={sec.defaultTitle} />
              </div>
              <div>
                <label>Nav Label</label>
                <input name={`${sec.id}_navLabel`} defaultValue={initialLabels[sec.id]?.navLabel ?? ''} placeholder={sec.defaultNavLabel} />
              </div>
            </div>
          </div>
        ))}
        
        <div className="actions">
          <button type="submit">Save labels</button>
        </div>
      </form>
    </section>
  );
}
