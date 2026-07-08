import type { TemplateProps } from '@livingcv/shared';
import { BASE_CSS, themeOverrides } from './styles';
import { Hero } from './Hero';
import { ProjectCard } from './ProjectCard';
import { MiniGrid } from './MiniGrid';
import { Background } from './Background';
import { Footer } from './Footer';
import { Signals } from './Signals';

export function ClassicTemplate(props: TemplateProps) {
  const { hero, projects, alsoShipped, background, footer, theme, sectionOrder = ['hero', 'projects', 'alsoShipped', 'signals', 'background'] } = props;
  const override = themeOverrides(theme);
  const brand = hero.name;

  const renderSection = (key: string) => {
    if (props.hiddenSections?.includes(key)) return null;

    if (key.startsWith('custom_')) {
      const custom = props.customSections?.find(c => c.id === key);
      if (!custom) return null;
      return (
        <section key={key} id={key} dangerouslySetInnerHTML={{ __html: custom.content }} />
      );
    }

    switch (key) {
      case 'hero':
        return <Hero key="hero" hero={hero} projects={projects} contactEnabled={props.contactEnabled} />;
      case 'projects':
        if (projects.length === 0) return null;
        return (
          <section id="projects" key="projects">
            <p className="section-kicker">{'01 \u2014 Selected work'}</p>
            <h2 className="section-title">Projects</h2>
            {projects.map((p) => (
              <ProjectCard key={p.slug} project={p} />
            ))}
          </section>
        );
      case 'alsoShipped':
        if (alsoShipped.length === 0) return null;
        return (
          <section key="alsoShipped">
            <p className="section-kicker">{'02 \u2014 Also shipped'}</p>
            <h2 className="section-title">Smaller tools</h2>
            <MiniGrid items={alsoShipped} />
          </section>
        );
      case 'signals':
        if (props.signals?.demonstrated.length === 0 && props.signals?.asserted.length === 0) return null;
        return <Signals key="signals" demonstrated={props.signals?.demonstrated ?? []} asserted={props.signals?.asserted ?? []} />;
      case 'background':
        return <Background key="background" background={background} />;
      default:
        return null;
    }
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: BASE_CSS }} />
      {override ? <style dangerouslySetInnerHTML={{ __html: override }} /> : null}

      <header className="nav">
        <div className="nav-inner">
          <a className="nav-brand" href="#top">{brand}</a>
          <ul className="nav-links">
            {!props.hiddenSections?.includes('projects') && projects.length > 0 && <li><a href="#projects">Projects</a></li>}
            {!props.hiddenSections?.includes('background') && <li><a href="#background">Background</a></li>}
            {!props.hiddenSections?.includes('footer') && <li><a href="#contact">Contact</a></li>}
            {props.talentMcpEnabled && <li><a href="/talent-mcp" className="nav-talentmcp-btn">TalentMCP</a></li>}
            <li><a href="/blog" className="nav-blog-btn">Blog</a></li>
          </ul>
        </div>
      </header>

      <main className="wrap h-resume" id="top">
        {sectionOrder.map(renderSection)}
      </main>

      <Footer footer={footer} />
    </>
  );
}
