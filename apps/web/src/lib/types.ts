// Row shapes for portfolio.db tables (§6). Kept as plain interfaces; queries
// use `db.prepare<[], RowType>(sql).get()` so the types flow from the call site.

export interface AppSettingRow {
  key: string;
  value: string;
  encrypted: number;
  updated_at: string;
}

export interface TemplateRow {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  is_builtin: number;
  component_ref: string | null;
}

export interface SiteContentRow {
  id: number;
  template_slug: string;
  section_key: string;
  content: string; // JSON
  position: number | null;
  updated_at: string;
}

export interface ProjectRow {
  id: number;
  slug: string;
  title: string;
  tagline: string | null;
  kind: string | null;
  role: string | null;
  repo_url: string | null;
  demo_url: string | null;
  package_url: string | null;
  stack: string | null; // JSON array
  status: string | null;
  sort_order: number | null;
  featured: number;
  diagram_svg: string | null;
  body: string | null; // JSON { designDecision, whatsReal, honestConstraint }
  install_cmd: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaseStudyRow {
  id: number;
  project_id: number | null;
  slug: string;
  frontmatter: string | null; // JSON
  body_markdown: string | null;
  published: number;
  created_at: string;
  updated_at: string;
}

export interface RecruiterSessionRow {
  id: string;
  channel: string;
  work_email: string | null;
  email_domain: string | null;
  company_domain_inferred: string | null;
  ip_hash: string | null;
  user_agent: string | null;
  started_at: string;
  last_active_at: string | null;
  email_verified: number;
  blocked_reason: string | null;
  message_count: number;
}

// site_content section JSON shapes for the `classic` template.
export interface HeroContent {
  eyebrow: string;
  name: string;
  roleLine: string;
  links: { label: string; href: string }[];
  diagramCenterLabel?: string;
}

export interface BackgroundContent {
  kicker: string;
  title: string;
  paragraphs: string[];
}

export interface FooterContent {
  links: { label: string; href: string }[];
  note?: string;
}

export interface ProjectBodyContent {
  designDecision: string;
  whatsReal: string;
  honestConstraint: string;
}

// Case-study frontmatter JSON (stored separately from the markdown body).
export interface CaseStudyFrontmatter {
  title: string;
  summary: string;
  stack: string[];
  status: string;
  links: { repo?: string; demo?: string; package?: string };
  date_started?: string;
  date_updated?: string;
  highlights: string[];
}
