import type { EvidenceSignal, AssertedSignal } from '@livingcv/shared';

export function Signals({
  demonstrated,
  asserted,
  kicker = 'Signals',
  title = 'Signals',
}: {
  demonstrated: EvidenceSignal[];
  asserted: AssertedSignal[];
  kicker?: string;
  title?: string;
}) {
  if (demonstrated.length === 0 && asserted.length === 0) return null;

  return (
    <section id="signals" className="signals-section">
      <p className="section-kicker">{kicker}</p>
      <h2 className="section-title">{title}</h2>

      {demonstrated.length > 0 && (
        <div className="signal-group">
          <p className="signal-group-label">Demonstrated <span className="signal-badge--note">(provenance-backed)</span></p>
          <div className="signal-badges">
            {demonstrated.map((s, i) => (
              <a
                key={`${s.sourceSlug}-${s.evidenceType}-${i}`}
                href={s.evidenceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="signal-badge signal-badge--demonstrated"
              >
                <span className="signal-link-icon">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1L16 8L8 15" stroke="currentColor" strokeWidth="2" fill="none" />
                    <path d="M0 8H14" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </span>
                {s.label}
              </a>
            ))}
          </div>
        </div>
      )}

      {asserted.length > 0 && (
        <div className="signal-group">
          <p className="signal-group-label">Asserted <span className="signal-badge--note">(self-reported)</span></p>
          <div className="signal-badges">
            {asserted.map((s, i) => (
              <span key={`asserted-${i}`} className="signal-badge signal-badge--asserted">
                {s.label}
                {s.category && <span className="signal-badge--cat">({s.category})</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
