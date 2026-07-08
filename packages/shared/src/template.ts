import { z } from 'zod';

// Template props contract (§9). A template is a directory under
// apps/web/templates/<slug>/ that exports a React component implementing
// `TemplateComponent` against this contract. v1 ships one built-in template,
// `classic`, a data-driven port of docs/index.html.
//
// The web app builds these props from portfolio.db at request time (content is
// runtime-editable, never build-time) and hands them to the active template.

export const LinkItem = z.object({
  label: z.string(),
  href: z.string(),
});
export type LinkItem = z.infer<typeof LinkItem>;

// A single body column: a custom heading + its text. The classic template
// renders these in a grid, wrapping to a new row past three columns.
export const ProjectBodyColumn = z.object({
  heading: z.string(),
  body: z.string(),
});
export type ProjectBodyColumn = z.infer<typeof ProjectBodyColumn>;

// A project body is an ordered list of columns with author-defined headings.
// (Historically this was a fixed trio — Design decision / What's real / Honest
// constraint. That shape is normalized into columns at read time.)
export const ProjectBody = z.object({
  columns: z.array(ProjectBodyColumn).default([]),
});
export type ProjectBody = z.infer<typeof ProjectBody>;

export const ProjectProps = z.object({
  slug: z.string(),
  name: z.string(),
  kind: z.string().optional(), // oss|commercial|volunteer|hardware
  status: z.string().optional(),
  links: z.array(LinkItem).default([]),
  tagline: z.string(),
  diagramSvg: z.string().optional(),
  diagramCaption: z.string().optional(),
  body: ProjectBody,
  installCmd: z.string().optional(),
  // True when a published case study exists for this project (drives a "Read the
  // case study" link on the card).
  hasCaseStudy: z.boolean().default(false),
});
export type ProjectProps = z.infer<typeof ProjectProps>;

export const MiniProjectProps = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
});
export type MiniProjectProps = z.infer<typeof MiniProjectProps>;

export const HeroProps = z.object({
  eyebrow: z.string(),
  name: z.string(),
  // roleLine may use **double asterisks** for a strong/emphasis span, mirroring
  // the italic role line with a bold fragment in the original template.
  roleLine: z.string(),
  links: z.array(LinkItem).default([]),
  // Short label drawn at the center of the hero node diagram (defaults to the
  // first name / initials when omitted).
  diagramCenterLabel: z.string().optional(),
});
export type HeroProps = z.infer<typeof HeroProps>;

export const BackgroundProps = z.object({
  kicker: z.string(),
  title: z.string(),
  paragraphs: z.array(z.string()).default([]),
});
export type BackgroundProps = z.infer<typeof BackgroundProps>;

export const FooterProps = z.object({
  links: z.array(LinkItem).default([]),
  note: z.string().optional(),
});
export type FooterProps = z.infer<typeof FooterProps>;

// CSS custom-property tokens for the classic paper/ink/signal/rust palette.
// Every value is a raw CSS string so the admin can override any token.
export const THEME_KEYS = [
  'paper',
  'paperDeep',
  'ink',
  'inkSoft',
  'rule',
  'signal',
  'signalSoft',
  'rust',
  'max',
  'fontBody',
  'fontHeading',
  'fontMono',
  'fontSizeBase',
] as const;
export type ThemeKey = (typeof THEME_KEYS)[number];

export const ThemeProps = z.object({
  paper: z.string().optional(),
  paperDeep: z.string().optional(),
  ink: z.string().optional(),
  inkSoft: z.string().optional(),
  rule: z.string().optional(),
  signal: z.string().optional(),
  signalSoft: z.string().optional(),
  rust: z.string().optional(),
  max: z.string().optional(),
  fontBody: z.string().optional(),
  fontHeading: z.string().optional(),
  fontMono: z.string().optional(),
  fontSizeBase: z.string().optional(),
});
export type ThemeProps = z.infer<typeof ThemeProps>;

export const CustomSectionProps = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
});
export type CustomSectionProps = z.infer<typeof CustomSectionProps>;

export const TemplateProps = z.object({
  hero: HeroProps,
  projects: z.array(ProjectProps).default([]),
  alsoShipped: z.array(MiniProjectProps).default([]),
  background: BackgroundProps,
  footer: FooterProps,
  theme: ThemeProps.default({}),
  sectionOrder: z.array(z.string()).optional(),
  hiddenSections: z.array(z.string()).default([]),
  customSections: z.array(CustomSectionProps).default([]),
  contactEnabled: z.boolean().optional(),
  // When true, the template shows a "TalentMCP" nav button linking to the
  // public-MCP connection instructions. Driven by publicmcp.enabled.
  talentMcpEnabled: z.boolean().optional(),
});
export type TemplateProps = z.infer<typeof TemplateProps>;

// Catalog of known app_settings keys (namespaced). Kept here so the web and
// orchestrator agree on the key strings. Secret-bearing keys are marked
// encrypted and stored through @livingcv/crypto.
export const SETTING_KEYS = {
  siteTitle: 'site.title',
  siteDomain: 'site.domain',
  siteMetaDescription: 'site.meta_description',
  siteOgImagePath: 'site.og_image_path',
  siteActiveTemplate: 'site.active_template',
  adminPasswordHash: 'admin.password_hash',
  adminEmail: 'admin.email',
  setupComplete: 'setup.complete',
  jobopsBaseUrl: 'jobops.base_url',
  jobopsAuthToken: 'jobops.auth_token', // encrypted
  agentLlmProvider: 'agent.llm_provider',
  agentLlmApiKey: 'agent.llm_api_key', // encrypted
  agentLlmModel: 'agent.llm_model',
  agentSystemPromptExtra: 'agent.system_prompt_extra',
  agentEnabled: 'agent.enabled',
  agentSearchProvider: 'agent.search_provider',
  agentSearchApiKey: 'agent.search_api_key', // encrypted
  voiceEnabled: 'voice.enabled',
  voiceMode: 'voice.mode', // cloud|local
  voiceSttProvider: 'voice.stt_provider',
  voiceSttApiKey: 'voice.stt_api_key', // encrypted
  voiceTtsProvider: 'voice.tts_provider',
  voiceTtsApiKey: 'voice.tts_api_key', // encrypted
  voiceTtsVoiceId: 'voice.tts_voice_id',
  // Connectivity
  telegramBotToken: 'telegram.bot_token', // encrypted
  telegramChatId: 'telegram.chat_id',
  emailProvider: 'email.provider',
  emailApiKey: 'email.api_key', // encrypted
  googleClientId: 'google.client_id',
  googleClientSecret: 'google.client_secret', // encrypted
  limitsSessionMaxMessages: 'limits.session_max_messages',
  limitsDailyMessageBudget: 'limits.daily_message_budget',
  limitsIpSessionsPerDay: 'limits.ip_sessions_per_day',
  notifyWebhookUrl: 'notify.webhook_url', // encrypted
  gateEnabled: 'gate.enabled',
  resumeFilename: 'resume.filename',
  mcpMasterKey: 'mcp.master_key',
  publicMcpEnabled: 'publicmcp.enabled',
  updatesRepo: 'updates.repo',
  updatesBranch: 'updates.branch',
  siteTwitterHandle: 'site.twitter_handle',
  siteLang: 'site.lang',
  siteKeywords: 'site.keywords',
  seoGoogleSiteVerification: 'seo.google_site_verification',
  seoBingVerification: 'seo.bing_verification',
} as const;
export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

// Keys whose values are encrypted at rest (§2 invariant 7).
export const ENCRYPTED_SETTING_KEYS: ReadonlySet<string> = new Set<string>([
  SETTING_KEYS.jobopsAuthToken,
  SETTING_KEYS.agentLlmApiKey,
  SETTING_KEYS.agentSearchApiKey,
  SETTING_KEYS.voiceSttApiKey,
  SETTING_KEYS.voiceTtsApiKey,
  SETTING_KEYS.notifyWebhookUrl,
  SETTING_KEYS.telegramBotToken,
  SETTING_KEYS.emailApiKey,
  SETTING_KEYS.googleClientSecret,
  SETTING_KEYS.mcpMasterKey,
]);

// LLM provider for the orchestrator (§7). Read from app_settings[agent.llm_provider].
export const LLM_PROVIDERS = ['anthropic', 'openai', 'gemini', 'deepseek'] as const;
export type LlmProvider = (typeof LLM_PROVIDERS)[number];
