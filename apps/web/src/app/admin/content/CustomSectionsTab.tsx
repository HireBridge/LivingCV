'use client';
import { useState } from 'react';

type CustomSection = {
  id: string;
  title: string;
  content: string;
};

export function CustomSectionsTab({ slug, initialSections }: { slug: string; initialSections: CustomSection[] }) {
  const [sections, setSections] = useState<CustomSection[]>(initialSections);

  const addSection = () => {
    const id = `custom_${Math.random().toString(36).substring(2, 9)}`;
    setSections(prev => [...prev, { id, title: 'New Custom Section', content: '<h2>Hello World</h2>\n<p>This is a custom section.</p>' }]);
  };

  const removeSection = (id: string) => {
    setSections(prev => prev.filter(s => s.id !== id));
  };

  const updateSection = (id: string, field: keyof CustomSection, value: string) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>
          Create custom HTML/Markdown sections. They will appear on your homepage once added to the order.
        </p>
        <button type="button" onClick={addSection}>+ Add Section</button>
      </div>

      <form method="post" action="/api/admin/content/save">
        <input type="hidden" name="template_slug" value={slug} />
        <input type="hidden" name="section" value="custom_sections" />
        <input type="hidden" name="custom_sections_json" value={JSON.stringify(sections)} />

        {sections.length === 0 ? (
          <div className="admin-card" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-soft)' }}>
            No custom sections yet.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {sections.map(s => (
              <div key={s.id} className="admin-card" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h4 style={{ margin: 0 }}>Section ID: <code>{s.id}</code></h4>
                  <button type="button" className="danger" onClick={() => removeSection(s.id)}>Delete</button>
                </div>
                
                <div className="row">
                  <label>Title (internal reference)</label>
                  <input 
                    value={s.title} 
                    onChange={e => updateSection(s.id, 'title', e.target.value)} 
                    required
                  />
                </div>
                <div className="row">
                  <label>Content (HTML/Markdown)</label>
                  <textarea 
                    value={s.content} 
                    onChange={e => updateSection(s.id, 'content', e.target.value)}
                    style={{ minHeight: 200, fontFamily: 'monospace' }}
                    required
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {sections.length > 0 && (
          <div className="actions" style={{ marginTop: 24 }}>
            <button type="submit">Save Custom Sections</button>
          </div>
        )}
      </form>
    </div>
  );
}
