import type { ThemeProps } from '@livingcv/shared';

// CSS ported from docs/index.html. The palette is exposed as CSS custom
// properties so the admin can override any token at runtime (§9) via a second
// <style> block built by themeOverrides().

// Map our camelCase theme keys to the CSS custom-property names the template
// uses. Keeping this mapping in one place lets a future template reuse the
// contract without coupling to these exact names.
const THEME_VAR: Record<keyof ThemeProps, string> = {
  paper: '--paper',
  paperDeep: '--paper-deep',
  ink: '--ink',
  inkSoft: '--ink-soft',
  rule: '--rule',
  signal: '--signal',
  signalSoft: '--signal-soft',
  rust: '--rust',
  max: '--max',
  fontBody: '--font-body',
  fontHeading: '--font-heading',
  fontMono: '--font-mono',
  fontSizeBase: '--font-size-base',
};

export const BASE_CSS = `
:root{
  --paper: #F2F0EA;
  --paper-deep: #E7E3D6;
  --ink: #1B2430;
  --ink-soft: #4A5568;
  --rule: #C9C4B6;
  --signal: #2F6F5E;
  --signal-soft: #E4ECE9;
  --rust: #9C5333;
  --max: 880px;
  --font-body: var(--next-font-body, 'Source Serif 4', Georgia, serif);
  --font-heading: var(--next-font-heading, 'Space Grotesk', system-ui, sans-serif);
  --font-mono: var(--next-font-mono, 'JetBrains Mono', monospace);
  --font-size-base: 18px;
}

*{box-sizing:border-box;}
html{scroll-behavior:smooth;}
@media (prefers-reduced-motion: reduce){
  html{scroll-behavior:auto;}
  *{animation-duration:0.001ms !important; transition-duration:0.001ms !important;}
}

body{
  margin:0;
  background:var(--paper);
  color:var(--ink);
  font-family:var(--font-body);
  font-size:var(--font-size-base);
  line-height:1.6;
}

h1,h2,h3,.eyebrow,.nav-brand,.mono,.tag,button,code,.cmd{
  font-family:var(--font-heading);
}
code, .cmd, .path{
  font-family:var(--font-mono);
  font-size:0.88em;
}

a{ color:var(--signal); text-decoration-thickness: 1px; text-underline-offset: 3px; }
a:hover{ color:var(--rust); }
a:focus-visible, button:focus-visible{ outline:2px solid var(--signal); outline-offset:3px; }

.wrap{ max-width:var(--max); margin:0 auto; padding:0 28px; }

/* NAV */
header.nav{
  position:sticky; top:0; z-index:20;
  background:rgba(242,240,234,0.92);
  backdrop-filter:blur(6px);
  border-bottom:1px solid var(--rule);
}
.nav-inner{
  max-width:var(--max); margin:0 auto; padding:16px 28px;
  display:flex; align-items:center; justify-content:space-between;
}
.nav-brand{ font-weight:600; font-size:1.05rem; color:var(--ink); text-decoration:none; letter-spacing:-0.01em; }
.nav-links{ display:flex; gap:24px; list-style:none; margin:0; padding:0; }
.nav-links a{ color:var(--ink-soft); font-size:0.92rem; font-weight:500; text-decoration:none; }
.nav-links a:hover{ color:var(--signal); }
.nav-blog-btn {
  background: var(--ink);
  color: var(--paper) !important;
  padding: 6px 14px;
  border-radius: 4px;
  transition: opacity 0.2s;
  font-weight: 600;
}
.nav-blog-btn:hover {
  opacity: 0.85;
}
.nav-talentmcp-btn {
  background: var(--paper);
  color: var(--ink) !important;
  padding: 6px 14px;
  border-radius: 4px;
  border: 1px solid var(--ink);
  transition: background 0.2s, color 0.2s;
  font-weight: 600;
}
.nav-talentmcp-btn:hover {
  background: var(--ink);
  color: var(--paper) !important;
}
@media (max-width:600px){ .nav-links{ gap:14px; } .nav-links a{ font-size:0.82rem; } .nav-blog-btn{ padding:4px 10px; } .nav-talentmcp-btn{ padding:4px 10px; } }

/* HERO */
.hero{ padding:76px 0 56px; }
.eyebrow{
  display:inline-block; font-size:0.78rem; font-weight:600; letter-spacing:0.08em;
  text-transform:uppercase; color:var(--signal); background:var(--signal-soft);
  padding:5px 11px; border-radius:3px; margin-bottom:22px;
}
h1.name{
  font-size:clamp(2.4rem, 5vw, 3.6rem);
  font-weight:700; line-height:1.05; letter-spacing:-0.02em;
  margin:0 0 18px;
}
.role-line{
  font-family:'Source Serif 4', serif; font-size:1.28rem; color:var(--ink-soft);
  max-width:620px; margin:0 0 30px; font-style:italic;
}
.role-line strong{ color:var(--ink); font-style:normal; }

.hero-links{ display:flex; flex-wrap:wrap; gap:10px; margin-bottom:56px; }
.pill{
  font-size:0.86rem; font-weight:500; color:var(--ink);
  border:1px solid var(--rule); border-radius:20px; padding:7px 15px;
  text-decoration:none; background:var(--paper);
}
.pill:hover{ border-color:var(--signal); color:var(--signal); }

/* HERO DIAGRAM */
.hero-diagram{ margin-top:8px; }
.hero-diagram svg{ width:100%; height:auto; display:block; }
.node-label{ font-family:'JetBrains Mono', monospace; font-size:11px; fill:var(--ink); }
.node-sub{ font-family:'Source Serif 4', serif; font-size:11px; fill:var(--ink-soft); font-style:italic; }

/* SECTIONS */
section{ padding:64px 0; border-top:1px solid var(--rule); }
section.no-rule{ border-top:none; }
h2.section-title{
  font-size:1.6rem; font-weight:700; letter-spacing:-0.01em; margin:0 0 8px;
}
.section-kicker{
  font-family:'JetBrains Mono', monospace; font-size:0.78rem; color:var(--ink-soft);
  text-transform:uppercase; letter-spacing:0.08em; margin:0 0 34px;
}

/* PROJECT CARD */
.project{
  display:grid; grid-template-columns: 1fr; gap:26px;
  padding:36px 0;
}
.project + .project{ border-top:1px dashed var(--rule); }
.project-head{ display:flex; align-items:baseline; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom:4px; }
.project-name{ font-size:1.5rem; font-weight:700; margin:0; letter-spacing:-0.01em; }
.project-links{ display:flex; gap:14px; font-size:0.86rem; font-family:'JetBrains Mono', monospace; }
.project-tagline{ color:var(--ink-soft); font-size:1.05rem; margin:0 0 22px; max-width:620px; }
.project-case-link{ display:inline-block; margin: -8px 0 16px; font-size:0.86rem; }

.diagram-box{
  background:var(--paper-deep); border:1px solid var(--rule); border-radius:6px;
  padding:20px 18px; margin-bottom:22px;
}
.diagram-box svg{ width:100%; height:auto; display:block; }
.diagram-caption{ font-family:'JetBrains Mono', monospace; font-size:0.72rem; color:var(--ink-soft); margin-top:10px; text-align:center; letter-spacing:0.02em; }

/* Up to three columns per row; a 4th+ column wraps to the next row. data-cols
   (1/2/3, capped) keeps 1- and 2-column bodies from leaving trailing gaps. */
.project-body{ display:grid; grid-template-columns: repeat(3, 1fr); gap:22px; }
.project-body[data-cols="1"]{ grid-template-columns: 1fr; }
.project-body[data-cols="2"]{ grid-template-columns: repeat(2, 1fr); }
@media (max-width:760px){
  .project-body,
  .project-body[data-cols="2"],
  .project-body[data-cols="3"]{ grid-template-columns:1fr; }
}
.project-body h4{
  font-family:'Space Grotesk'; font-size:0.76rem; font-weight:600; text-transform:uppercase;
  letter-spacing:0.06em; color:var(--rust); margin:0 0 8px;
}
.project-body p{ font-size:0.94rem; margin:0; color:var(--ink); }

.install-row{
  margin-top:22px; background:#EDEAE0; border:1px solid var(--rule); border-radius:5px;
  padding:11px 16px; display:flex; align-items:center; gap:10px; overflow-x:auto;
}
.install-row .prompt{ color:var(--ink-soft); user-select:none; }

/* also-built strip */
.mini-grid{ display:grid; grid-template-columns:repeat(2,1fr); gap:20px; }
@media (max-width:600px){ .mini-grid{ grid-template-columns:1fr; } }
.mini-card{ border:1px solid var(--rule); border-radius:6px; padding:18px 20px; background:var(--paper-deep); }
.mini-card h4{ margin:0 0 6px; font-size:1.02rem; font-weight:600; }
.mini-card p{ margin:0; font-size:0.9rem; color:var(--ink-soft); }

/* background section */
.bg-text{ max-width:640px; }
.bg-text p{ margin:0 0 16px; }

/* footer */
footer{ padding:52px 0 70px; }
.footer-links{ display:flex; flex-wrap:wrap; gap:22px; font-family:'JetBrains Mono', monospace; font-size:0.9rem; margin-bottom:18px; }
.footer-note{ color:var(--ink-soft); font-size:0.86rem; }

/* reveal on scroll */
.reveal{ opacity:0; transform:translateY(14px); transition:opacity 0.6s ease, transform 0.6s ease; }
.reveal.is-visible{ opacity:1; transform:translateY(0); }
`;

// Build a runtime <style> override from admin-provided theme tokens. Only
// non-empty tokens are emitted, so partial overrides don't wipe defaults.
export function themeOverrides(theme: ThemeProps): string {
  const lines: string[] = [];
  (Object.keys(THEME_VAR) as (keyof ThemeProps)[]).forEach((key) => {
    const value = theme[key];
    if (value) {
      lines.push(`  ${THEME_VAR[key]}: ${value};`);
    }
  });
  if (lines.length === 0) return '';
  return `:root{\n${lines.join('\n')}\n}`;
}
