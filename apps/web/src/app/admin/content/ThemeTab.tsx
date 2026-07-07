'use client';
import { useState } from 'react';

const THEME_KEYS = [
  { key: 'paper', label: 'Paper (Background)' },
  { key: 'paperDeep', label: 'Paper Deep (Secondary Background)' },
  { key: 'ink', label: 'Ink (Primary Text)' },
  { key: 'inkSoft', label: 'Ink Soft (Secondary Text)' },
  { key: 'rule', label: 'Rule (Borders)' },
  { key: 'signal', label: 'Signal (Primary Accent)' },
  { key: 'signalSoft', label: 'Signal Soft (Accent Hover)' },
  { key: 'rust', label: 'Rust (Destructive/Error)' },
];

const FONT_KEYS = [
  { key: 'fontBody', label: 'Body Font Family', placeholder: "'Source Serif 4', Georgia, serif" },
  { key: 'fontHeading', label: 'Heading Font Family', placeholder: "'Space Grotesk', system-ui, sans-serif" },
  { key: 'fontMono', label: 'Monospace Font Family', placeholder: "'JetBrains Mono', monospace" },
  { key: 'fontSizeBase', label: 'Base Font Size', placeholder: "18px" },
];

export function ThemeTab({ slug, initialTheme }: { slug: string, initialTheme: string }) {
  const [themeObj, setThemeObj] = useState<Record<string, string>>(() => {
    try { return JSON.parse(initialTheme || '{}'); } catch { return {}; }
  });
  const [jsonText, setJsonText] = useState(initialTheme || '{}');

  const handleColorChange = (key: string, value: string) => {
    const newObj = { ...themeObj, [key]: value };
    if (!value) delete newObj[key];
    setThemeObj(newObj);
    setJsonText(JSON.stringify(newObj, null, 2));
  };

  const handleJsonChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setJsonText(e.target.value);
    try {
      const parsed = JSON.parse(e.target.value);
      if (typeof parsed === 'object' && parsed !== null) {
        setThemeObj(parsed);
      }
    } catch {
      // ignore parse errors while typing
    }
  };

  const handleResetToDefault = () => {
    setThemeObj({});
    setJsonText('{}');
  };

  return (
    <div>
      <section className="admin-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0 }}>Colors & Theme</h3>
          <button type="button" onClick={handleResetToDefault} className="secondary text-sm" style={{ padding: '4px 8px', fontSize: '0.85rem' }}>
            Set to default
          </button>
        </div>
        <p style={{ marginBottom: 20, color: 'var(--ink-soft)', fontSize: '0.9rem' }}>
          Customize your portfolio's look and feel. Leave empty to use default values.
        </p>

        <form method="post" action="/api/admin/content/save">
          <input type="hidden" name="template_slug" value={slug} />
          <input type="hidden" name="section" value="theme" />
          <input type="hidden" name="theme_json" value={jsonText} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 15, marginBottom: 30 }}>
            {THEME_KEYS.map(({ key, label }) => (
              <div key={key}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 5 }}>{label}</label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <input
                    type="color"
                    value={themeObj[key] || '#ffffff'}
                    onChange={(e) => handleColorChange(key, e.target.value)}
                    style={{ width: 40, height: 35, padding: 0, border: 'none', borderRadius: 4, cursor: 'pointer' }}
                  />
                  <input
                    type="text"
                    value={themeObj[key] || ''}
                    onChange={(e) => handleColorChange(key, e.target.value)}
                    placeholder="default"
                    style={{ flex: 1, fontFamily: 'monospace' }}
                  />
                </div>
              </div>
            ))}
          </div>

          <h3 style={{ marginTop: 40, marginBottom: 20, fontSize: '1rem' }}>Typography & Layout</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 15, marginBottom: 30 }}>
            {FONT_KEYS.map(({ key, label, placeholder }) => (
              <div key={key}>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 5 }}>{label}</label>
                <input
                  type="text"
                  value={themeObj[key] || ''}
                  onChange={(e) => handleColorChange(key, e.target.value)}
                  placeholder={placeholder}
                  style={{ width: '100%', fontFamily: 'monospace' }}
                />
              </div>
            ))}
          </div>

          <div className="actions">
            <button type="submit">Save Theme & Typography</button>
          </div>
        </form>
      </section>

      <section className="admin-card">
        <h3 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Advanced: JSON Editor</span>
          <a href="/admin/help/theme" target="_blank" rel="noreferrer" style={{ fontSize: '0.85rem', color: 'var(--signal)' }}>
            Help with advanced JSON
          </a>
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', marginBottom: 15 }}>
          Provide a JSON object mapping theme keys to valid CSS colors. You can use CSS variables here as well.
        </p>
        <form method="post" action="/api/admin/content/save">
          <input type="hidden" name="template_slug" value={slug} />
          <input type="hidden" name="section" value="theme" />
          <div className="row">
            <textarea
              name="theme_json"
              value={jsonText}
              onChange={handleJsonChange}
              style={{ minHeight: 180, fontFamily: 'monospace' }}
            />
          </div>
          <div className="actions">
            <button type="submit">Save JSON Theme</button>
          </div>
        </form>
      </section>
    </div>
  );
}
