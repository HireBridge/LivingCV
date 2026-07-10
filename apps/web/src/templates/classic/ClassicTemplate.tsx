import type { TemplateProps } from '@livingcv/shared';
import { BASE_CSS, themeOverrides } from './styles';
import { Hero } from './Hero';
import { ProjectCard } from './ProjectCard';
import { MiniGrid } from './MiniGrid';
import { Background } from './Background';
import { Footer } from './Footer';
import { Signals } from './Signals';
import { Contact } from './Contact';

// ── Section metadata ─────────────────────────────────────────────────────────
// Hard-coded defaults for every built-in section. Admin-overrides from
// sectionLabels (site_content section_key='section_labels') win when present.

const SECTION_DEFAULTS: Record<string, { kicker: string; title: string; navLabel: string; id: string }> = {
  projects:    { kicker: '01 — Selected work', title: 'Projects',     navLabel: 'Projects',    id: 'projects'    },
  alsoShipped: { kicker: '02 — Also shipped',  title: 'Smaller tools', navLabel: 'Also Shipped', id: 'also-shipped' },
  signals:     { kicker: 'Signals',             title: 'Signals',       navLabel: 'Signals',      id: 'signals'     },
  background:  { kicker: '03 — Before this',   title: 'Background',    navLabel: 'Background',   id: 'background'  },
  contact:     { kicker: 'Get in touch',        title: 'Contact',       navLabel: 'Contact',      id: 'contact'     },
};

// Sections that appear in the nav bar (hero and alsoShipped/footer don't).
// Order in this set determines nav fallback order; actual order follows sectionOrder.
const NAV_ELIGIBLE = new Set(['projects', 'signals', 'background', 'contact']);

// ── Component ────────────────────────────────────────────────────────────────

export function ClassicTemplate(props: TemplateProps) {
  const {
    hero,
    projects,
    alsoShipped,
    background,
    footer,
    theme,
    sectionOrder = ['hero', 'projects', 'alsoShipped', 'signals', 'background', 'contact'],
    sectionLabels = {},
  } = props;
  const hiddenSections = props.hiddenSections ?? [];
  const override = themeOverrides(theme);
  const brand = hero.name;

  /** Merge section defaults with any admin override from sectionLabels. */
  function labelFor(key: string): { kicker: string; title: string; navLabel: string; id: string } {
    const defaults = SECTION_DEFAULTS[key] ?? { kicker: key, title: key, navLabel: key, id: key };
    const override = sectionLabels[key] ?? {};
    return {
      kicker:   override.kicker   ?? defaults.kicker,
      title:    override.title    ?? defaults.title,
      navLabel: override.navLabel ?? defaults.navLabel,
      id:       defaults.id,
    };
  }

  // ── Render a single section ─────────────────────────────────────────────

  const renderSection = (key: string) => {
    if (hiddenSections.includes(key)) return null;

    // Custom sections (id starts with 'custom_')
    if (key.startsWith('custom_')) {
      const custom = props.customSections?.find(c => c.id === key);
      if (!custom) return null;
      return (
        <section key={key} id={key} dangerouslySetInnerHTML={{ __html: custom.content }} />
      );
    }

    const lbl = labelFor(key);

    switch (key) {
      case 'hero':
        return <Hero key="hero" hero={hero} projects={projects} contactEnabled={props.contactEnabled} />;

      case 'projects':
        if (projects.length === 0) return null;
        return (
          <section id={lbl.id} key="projects">
            <p className="section-kicker">{lbl.kicker}</p>
            <h2 className="section-title">{lbl.title}</h2>
            {projects.map((p) => (
              <ProjectCard key={p.slug} project={p} />
            ))}
          </section>
        );

      case 'alsoShipped':
        if (alsoShipped.length === 0) return null;
        return (
          <section id={lbl.id} key="alsoShipped">
            <p className="section-kicker">{lbl.kicker}</p>
            <h2 className="section-title">{lbl.title}</h2>
            <MiniGrid items={alsoShipped} />
          </section>
        );

      case 'signals':
        if (
          (props.signals?.demonstrated.length ?? 0) === 0 &&
          (props.signals?.asserted.length ?? 0) === 0
        ) return null;
        return (
          <Signals
            key="signals"
            demonstrated={props.signals?.demonstrated ?? []}
            asserted={props.signals?.asserted ?? []}
            kicker={lbl.kicker}
            title={lbl.title}
          />
        );

      case 'background':
        return (
          <Background
            key="background"
            background={background}
            kicker={lbl.kicker}
            title={lbl.title}
          />
        );

      case 'contact':
        return (
          <Contact
            key="contact"
            footer={footer}
            kicker={lbl.kicker}
            title={lbl.title}
          />
        );

      default:
        return null;
    }
  };

  // ── Nav links — derived from sectionOrder so order + hidden are reflected ─

  const navLinks: { href: string; label: string }[] = [];
  for (const key of sectionOrder) {
    if (hiddenSections.includes(key)) continue;
    if (!NAV_ELIGIBLE.has(key)) continue;

    // Custom sections with a title are also nav-eligible
    if (key.startsWith('custom_')) {
      const custom = props.customSections?.find(c => c.id === key);
      if (custom?.title) navLinks.push({ href: `#${key}`, label: custom.title });
      continue;
    }

    const lbl = labelFor(key);
    navLinks.push({ href: `#${lbl.id}`, label: lbl.navLabel });
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: BASE_CSS }} />
      {override ? <style dangerouslySetInnerHTML={{ __html: override }} /> : null}

      <header className="nav">
        <div className="nav-inner">
          <a className="nav-brand" href="#top">{brand}</a>
          <ul className="nav-links">
            {navLinks.map((l) => (
              <li key={l.href}><a href={l.href}>{l.label}</a></li>
            ))}
            {props.talentMcpEnabled && (
              <li><a href="/talent-mcp" className="nav-talentmcp-btn">TalentMCP</a></li>
            )}
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
