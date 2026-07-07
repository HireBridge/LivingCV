# Templates

A **template** is a directory under `apps/web/src/templates/<slug>/` exporting a React component that renders the portfolio against the typed `TemplateProps` contract. v1 ships one built-in template, `classic`; third parties can add more without touching core code.

## Contract

The props your component receives — defined in [`packages/shared/src/template.ts`](../packages/shared/src/template.ts) and validated with zod:

```ts
type TemplateProps = {
  hero: {
    eyebrow: string;
    name: string;
    roleLine: string;   // supports **double asterisks** for emphasis
    links: { label: string; href: string }[];
    diagramCenterLabel?: string;
  };
  projects: ProjectProps[];   // featured, ordered
  alsoShipped: MiniProjectProps[];
  background: { kicker: string; title: string; paragraphs: string[] };
  footer: { links: { label: string; href: string }[]; note?: string };
  theme: { [token: string]: string };   // CSS values for theme keys
};

type ProjectProps = {
  slug: string;
  name: string;
  kind?: 'oss'|'commercial'|'volunteer'|'hardware'|string;
  status?: string;
  links: { label: string; href: string }[];  // built from repo_url/demo_url/package_url
  tagline: string;
  diagramSvg?: string;
  diagramCaption?: string;
  body: { designDecision: string; whatsReal: string; honestConstraint: string };
  installCmd?: string;
  hasCaseStudy: boolean;     // drives a "Read the case study" link
};

type MiniProjectProps = { slug: string; name: string; description: string };
```

The active template slug lives in `app_settings.site.active_template`. The web app builds these props from `portfolio.db` per request (content is runtime-editable, never build-time — `force-dynamic`).

## Authoring a template

1. Create `apps/web/src/templates/<your-slug>/YourTemplate.tsx`.
2. Import `TemplateProps` (and the supporting schemas/types) from `@portfolio/shared`.
3. Render the data. You may inline your own CSS or import a CSS module.
4. Add an entry to `apps/web/src/templates/registry.ts`:

```ts
export const TEMPLATES: TemplateEntry[] = [
  { slug: 'classic', name: 'Classic', description: '…', isBuiltin: true, Component: ClassicTemplate },
  // add yours here
  { slug: 'your-slug', name: 'Your Template', description: '…', isBuiltin: false, Component: YourTemplate },
];
```

5. Set `site.active_template` in the admin console (or via the setup wizard) to your slug. Page reloads pick it up.

That's all. Templates are loaded by slug at request time — no rebuild required to swap templates.

## Conventions

- Use CSS custom properties for any visual tokens so the admin can theme your template from the `theme` override (the classic template exposes `--paper`, `--ink`, `--signal`, `--rust`, etc.). The admin edits `site_content[template_slug=your-slug][section_key=theme]` as a JSON object of `{ key: cssValue }`.
- Avoid hardcoded persona content (names, links, copy). All copy + URLs come through `TemplateProps`.
- Server components only. If you need a client-side reveal/animation, factor out the interactive piece into a `'use client'` component and import it.

## Editing content

Content for a template lives under `site_content` keyed by `(template_slug, section_key)`. The classic template reads three sections: `hero`, `background`, `footer`, plus an optional `theme`. Add a new section by writing to `site_content` and reading it in your template's `buildTemplateProps` counterpart (or by extending the content builder in `apps/web/src/lib/content.ts`).

## Styling

The classic template demonstrates two techniques worth stealing:

- A base `<style>` block (with `dangerouslySetInnerHTML`) defines the palette on `:root` once per page.
- A second `<style>` block merges admin theme overrides onto `:root` (only the tokens the admin provided).
