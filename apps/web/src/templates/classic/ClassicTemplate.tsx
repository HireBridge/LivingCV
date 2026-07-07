import type { TemplateProps } from '@portfolio/shared';
import { BASE_CSS, themeOverrides } from './styles';
import { Hero } from './Hero';
import { ProjectCard } from './ProjectCard';
import { MiniGrid } from './MiniGrid';
import { Background } from './Background';
import { Footer } from './Footer';

export function ClassicTemplate(props: TemplateProps) {
  const { hero, projects, alsoShipped, background, footer, theme } = props;
  const override = themeOverrides(theme);
  const brand = hero.name;
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: BASE_CSS }} />
      {override ? <style dangerouslySetInnerHTML={{ __html: override }} /> : null}

      <header className="nav">
        <div className="nav-inner">
          <a className="nav-brand" href="#top">{brand}</a>
          <ul className="nav-links">
            <li><a href="#projects">Projects</a></li>
            <li><a href="#background">Background</a></li>
            <li><a href="#contact">Contact</a></li>
          </ul>
        </div>
      </header>

      <main className="wrap" id="top">
        <Hero hero={hero} projects={projects} />

        {projects.length > 0 ? (
          <section id="projects">
            <p className="section-kicker">{'01 \u2014 Selected work'}</p>
            <h2 className="section-title">Projects</h2>
            {projects.map((p) => (
              <ProjectCard key={p.slug} project={p} />
            ))}
          </section>
        ) : null}

        {alsoShipped.length > 0 ? (
          <section>
            <p className="section-kicker">{'02 \u2014 Also shipped'}</p>
            <h2 className="section-title">Smaller tools</h2>
            <MiniGrid items={alsoShipped} />
          </section>
        ) : null}

        <Background background={background} />
      </main>

      <Footer footer={footer} />
    </>
  );
}
