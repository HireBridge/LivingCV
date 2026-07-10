import type { HeroProps, ProjectProps } from '@livingcv/shared';
import { HeroDiagram } from './HeroDiagram';
import { RevealOnScroll } from './RevealOnScroll';

// Render the role line, allowing **double asterisks** for a strong span,
// mirroring the italic role line with a bold fragment in the original template.
function renderRoleLine(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={i}>{p.slice(2, -2)}</strong>;
    }
    return <span key={i}>{p}</span>;
  });
}

export function Hero({ hero, projects, contactEnabled }: { hero: HeroProps; projects: ProjectProps[]; contactEnabled?: boolean }) {
  // diagram.centerLabel supersedes the top-level diagramCenterLabel
  const centerLabel =
    hero.diagram?.centerLabel ||
    hero.diagramCenterLabel ||
    hero.name.split(' ')[0] ||
    '';

  // enabled:false hides the diagram; if no diagram key at all, show when there are projects
  const diagramEnabled = hero.diagram?.enabled !== false;

  return (
    <section className="hero no-rule">
      {hero.eyebrow ? <span className="eyebrow">{hero.eyebrow}</span> : null}
      
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', marginBottom: 18 }}>
        <h1 className="name p-name" style={{ margin: 0 }}>{hero.name}</h1>
        {contactEnabled && (
          <a href="#contact" className="pill" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--signal)', color: 'white', borderColor: 'var(--signal)' }}>
            <span style={{ fontSize: '1.1rem' }}>💬</span> Contact {hero.name.split(' ')[0]}
          </a>
        )}
      </div>

      {hero.roleLine ? <p className="role-line p-summary">{renderRoleLine(hero.roleLine)}</p> : null}
      {hero.links.length > 0 ? (
        <div className="hero-links">
          {hero.links.map((l) => (
            <a key={l.href} className="pill u-url" href={l.href} target="_blank" rel="noopener noreferrer">
              {l.label}
            </a>
          ))}
        </div>
      ) : null}
      {diagramEnabled && projects.length > 0 ? (
        <RevealOnScroll>
          <HeroDiagram
            centerLabel={centerLabel}
            projects={projects}
            diagramConfig={hero.diagram}
          />
        </RevealOnScroll>
      ) : null}
    </section>
  );
}
