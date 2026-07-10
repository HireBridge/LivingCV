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

const PRESETS = [
  { id: 'classic', name: 'Classic Default', description: 'The original clean and bright LivingCV theme.' },
  { id: 'cyber', name: 'Cyber', description: 'Dark theme with emerald and cyan accents inspired by kirank.tech.' },
  { id: 'minimal_dark', name: 'Minimal Dark', description: 'Sleek, distraction-free dark canvas for maximum readability.' },
  { id: 'solar', name: 'Solar', description: 'Warm amber and orange gradients for a cozy feel.' }
];

const PRESET_DATA: Record<string, any> = {
  classic: {
    preset: 'classic',
    paper: '#F2F0EA',
    paperDeep: '#E7E3D6',
    ink: '#1B2430',
    inkSoft: '#4A5568',
    rule: '#C9C4B6',
    signal: '#2F6F5E',
    signalSoft: '#E4ECE9',
    rust: '#9C5333',
    fontBody: "'Source Serif 4', Georgia, serif",
    fontHeading: "'Space Grotesk', system-ui, sans-serif",
    fontMono: "'JetBrains Mono', monospace",
    customCss: ""
  },
  cyber: {
    preset: 'cyber',
    paper: '#07090e',
    paperDeep: '#0c0f17',
    ink: '#f8fafc',
    inkSoft: '#94a3b8',
    rule: 'rgba(30, 41, 59, 0.6)',
    signal: '#10b981',
    signalSoft: 'rgba(16, 185, 129, 0.15)',
    rust: '#06b6d4',
    fontBody: "'Outfit', sans-serif",
    fontHeading: "'Outfit', sans-serif",
    fontMono: "'JetBrains Mono', monospace",
    customCss: `body {
  background-image: linear-gradient(rgba(6, 182, 212, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(6, 182, 212, 0.03) 1px, transparent 1px);
  background-size: 60px 60px;
}
.pill { background: rgba(16, 185, 129, 0.1); border-color: rgba(16, 185, 129, 0.2); }
header.nav { background: rgba(7, 9, 14, 0.92) !important; border-bottom-color: rgba(30, 41, 59, 0.6) !important; }
.project-card:hover { transform: translateY(-5px); box-shadow: 0 10px 25px -10px rgba(0, 0, 0, 0.7); transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1), box-shadow 0.3s; }
`
  },
  minimal_dark: {
    preset: 'minimal_dark',
    paper: '#121212',
    paperDeep: '#0a0a0a',
    ink: '#e0e0e0',
    inkSoft: '#a3a3a3',
    rule: '#333333',
    signal: '#ffffff',
    signalSoft: 'rgba(255, 255, 255, 0.1)',
    rust: '#ff5555',
    fontBody: "'Inter', sans-serif",
    fontHeading: "'Inter', sans-serif",
    fontMono: "monospace",
    customCss: ""
  },
  solar: {
    preset: 'solar',
    paper: '#fdf6e3',
    paperDeep: '#eee8d5',
    ink: '#073642',
    inkSoft: '#586e75',
    rule: '#ccc',
    signal: '#b58900',
    signalSoft: 'rgba(181, 137, 0, 0.15)',
    rust: '#dc322f',
    fontBody: "Georgia, serif",
    fontHeading: "'Space Grotesk', sans-serif",
    fontMono: "monospace",
    customCss: ""
  }
};

export function ThemeTab({ slug, initialTheme }: { slug: string, initialTheme: string }) {
  const [themeObj, setThemeObj] = useState<Record<string, string>>(() => {
    try { return JSON.parse(initialTheme || '{}'); } catch { return {}; }
  });
  const [jsonText, setJsonText] = useState(initialTheme || '{}');
  const [activeSubTab, setActiveSubTab] = useState<'preset' | 'custom'>('preset');

  const handleColorChange = (key: string, value: string) => {
    const newObj = { ...themeObj, [key]: value, preset: 'custom' };
    if (!value) delete newObj[key];
    setThemeObj(newObj);
    setJsonText(JSON.stringify(newObj, null, 2));
  };

  const handleCssChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const newObj = { ...themeObj, customCss: value, preset: 'custom' };
    if (!value) delete newObj.customCss;
    setThemeObj(newObj);
    setJsonText(JSON.stringify(newObj, null, 2));
  };

  const selectPreset = (presetId: string) => {
    const newObj = { ...PRESET_DATA[presetId] };
    setThemeObj(newObj);
    setJsonText(JSON.stringify(newObj, null, 2));
  };

  const currentPreset = themeObj.preset || 'classic';

  return (
    <div>
      <section className="admin-card" style={{ paddingBottom: 0 }}>
        <div style={{ display: 'flex', gap: 10, borderBottom: '1px solid var(--rule)', paddingBottom: 10, marginBottom: 20 }}>
          <button 
            type="button" 
            onClick={() => setActiveSubTab('preset')} 
            style={{ 
              background: activeSubTab === 'preset' ? 'var(--signal)' : 'transparent', 
              color: activeSubTab === 'preset' ? 'var(--paper)' : 'var(--ink)',
              border: activeSubTab === 'preset' ? 'none' : '1px solid var(--rule)',
              padding: '8px 16px', borderRadius: 4, cursor: 'pointer', fontWeight: 600
            }}
          >
            Select a Theme
          </button>
          <button 
            type="button" 
            onClick={() => setActiveSubTab('custom')} 
            style={{ 
              background: activeSubTab === 'custom' ? 'var(--signal)' : 'transparent', 
              color: activeSubTab === 'custom' ? 'var(--paper)' : 'var(--ink)',
              border: activeSubTab === 'custom' ? 'none' : '1px solid var(--rule)',
              padding: '8px 16px', borderRadius: 4, cursor: 'pointer', fontWeight: 600
            }}
          >
            Build your custom theme
          </button>
        </div>

        {activeSubTab === 'preset' && (
          <div>
            <p style={{ marginBottom: 20, color: 'var(--ink-soft)', fontSize: '0.9rem' }}>
              Choose from our hand-crafted preset themes. Selecting a preset will instantly update your portfolio's colors and fonts.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20, marginBottom: 30 }}>
              {PRESETS.map((p) => {
                const isActive = currentPreset === p.id;
                return (
                  <div 
                    key={p.id} 
                    onClick={() => selectPreset(p.id)}
                    style={{ 
                      border: isActive ? '2px solid var(--signal)' : '1px solid var(--rule)', 
                      borderRadius: 8, padding: 16, cursor: 'pointer',
                      background: isActive ? 'var(--paper-deep)' : 'transparent'
                    }}
                  >
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '1.1rem' }}>{p.name}</h4>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--ink-soft)' }}>{p.description}</p>
                  </div>
                );
              })}
            </div>
            <form method="post" action="/api/admin/content/save" style={{ borderTop: '1px solid var(--rule)', paddingTop: 20, paddingBottom: 20 }}>
              <input type="hidden" name="template_slug" value={slug} />
              <input type="hidden" name="section" value="theme" />
              <input type="hidden" name="theme_json" value={jsonText} />
              <div className="actions">
                <button type="submit">Apply Selected Theme</button>
              </div>
            </form>
          </div>
        )}

        {activeSubTab === 'custom' && (
          <div>
            <p style={{ marginBottom: 20, color: 'var(--ink-soft)', fontSize: '0.9rem' }}>
              Customize your portfolio's look and feel. Leave empty to use default values.
            </p>
            <form method="post" action="/api/admin/content/save" style={{ paddingBottom: 20 }}>
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

              <h3 style={{ marginTop: 40, marginBottom: 20, fontSize: '1rem' }}>Custom CSS / Animations</h3>
              <div style={{ marginBottom: 30 }}>
                <textarea
                  value={themeObj.customCss || ''}
                  onChange={handleCssChange}
                  placeholder="body { background-image: ... }"
                  style={{ width: '100%', minHeight: 120, fontFamily: 'monospace' }}
                />
              </div>

              <div className="actions">
                <button type="submit">Save Custom Theme</button>
              </div>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}
