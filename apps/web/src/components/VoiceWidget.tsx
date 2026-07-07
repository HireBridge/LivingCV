'use client';

// Minimal placeholder for voice widget

export function VoiceWidget(props: { config: { enabled: boolean } }) {
  if (!props.config.enabled) return null;
  return (
    <div style={panelStyle}>
      <header style={headerStyle}>
        <strong>Voice concierge</strong>
        <button type="button" onClick={(e) => (e.target as HTMLElement).closest('div')!.style.display = 'none'} aria-label="Close">×</button>
      </header>
      <div style={messagesStyle}>
        <p>Voice coming soon.</p>
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  position: 'fixed', right: 20, bottom: 20, zIndex: 30,
  width: 360, height: 160, background: 'var(--paper)', color: 'var(--ink)',
  border: '1px solid var(--rule)', borderRadius: 10, display: 'flex', flexDirection: 'column',
  fontFamily: "'Source Serif 4', Georgia, serif", boxShadow: '0 6px 24px rgba(0,0,0,0.22)',
};
const headerStyle: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
  padding: '12px 16px', borderBottom: '1px solid var(--rule)', fontFamily: "'Space Grotesk', sans-serif",
};
const messagesStyle: React.CSSProperties = {
  flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center', alignItems: 'center',
};

