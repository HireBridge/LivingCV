import type { HeroProps, ProjectProps } from '@mohith-das/portfolio-shared';
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

export function Hero({ hero, projects }: { hero: HeroProps; projects: ProjectProps[] }) {
  const centerLabel = hero.diagramCenterLabel || hero.name.split(' ')[0] || '';
  return (
    <section className="hero no-rule">
      {hero.eyebrow ? <span className="eyebrow">{hero.eyebrow}</span> : null}
      <h1 className="name">{hero.name}</h1>
      {hero.roleLine ? <p className="role-line">{renderRoleLine(hero.roleLine)}</p> : null}
      {hero.links.length > 0 ? (
        <div className="hero-links">
          {hero.links.map((l) => (
            <a key={l.href} className="pill" href={l.href} target="_blank" rel="noopener noreferrer">
              {l.label}
            </a>
          ))}
        </div>
      ) : null}
      {projects.length > 0 ? (
        <RevealOnScroll>
          <HeroDiagram centerLabel={centerLabel} projects={projects} />
        </RevealOnScroll>
      ) : null}
    </section>
  );
}
