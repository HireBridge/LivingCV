import type { ComponentType } from 'react';
import type { TemplateProps } from '@portfolio/shared';
import { ClassicTemplate } from './classic/ClassicTemplate';

export interface TemplateEntry {
  slug: string;
  name: string;
  description: string;
  isBuiltin: boolean;
  Component: ComponentType<TemplateProps>;
}

// The set of templates shipped with the portfolio app. §9 says a template is a
// directory under apps/web/templates/<slug>/ that exports a component matching
// the TemplateProps contract from @portfolio/shared. Adding a new template is a
// matter of dropping in another entry here + its component file.
export const TEMPLATES: TemplateEntry[] = [
  {
    slug: 'classic',
    name: 'Classic',
    description:
      'Paper/ink/signal/rust palette with Space Grotesk + Source Serif 4 + JetBrains Mono. Faithful port of the bundled docs/index.html.',
    isBuiltin: true,
    Component: ClassicTemplate,
  },
];

export function getTemplate(slug: string): TemplateEntry | undefined {
  return TEMPLATES.find((t) => t.slug === slug);
}

export { ClassicTemplate } from './classic/ClassicTemplate';
