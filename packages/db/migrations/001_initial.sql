-- 001_initial.sql — portfolio.db schema (§6).
-- All tables for the portfolio platform. _migrations is created by the
-- migration runner, not here (mirrors jobops).

-- Key/value settings; encrypted rows hold v1:<iv>:<tag>:<ct> from @portfolio/crypto.
-- Key namespaces: site.*, jobops.*, agent.*, voice.*, limits.*, notify.*, gate.*.
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  encrypted  INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

-- Bundled + third-party templates. v1 ships one built-in: 'classic'.
CREATE TABLE IF NOT EXISTS templates (
  id            INTEGER PRIMARY KEY,
  slug          TEXT UNIQUE,
  name          TEXT,
  description   TEXT,
  is_builtin    INTEGER,
  component_ref TEXT
);

-- Per-template editable content sections (JSON in `content`).
CREATE TABLE IF NOT EXISTS site_content (
  id            INTEGER PRIMARY KEY,
  template_slug TEXT,
  section_key   TEXT,
  content       TEXT,            -- JSON
  position      INTEGER,
  updated_at    TEXT
);

-- Projects shown on the public site + case-study parents.
CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY,
  slug        TEXT UNIQUE,
  title       TEXT,
  tagline     TEXT,
  kind        TEXT,              -- oss|commercial|volunteer|hardware
  role        TEXT,
  repo_url    TEXT,
  demo_url    TEXT,
  package_url TEXT,
  stack       TEXT,              -- JSON array
  status      TEXT,
  sort_order   INTEGER,
  featured    INTEGER,
  diagram_svg TEXT,
  body        TEXT,              -- JSON: 3-col design-decision / whats-real / honest-constraint
  install_cmd TEXT,
  created_at  TEXT,
  updated_at  TEXT
);

-- One optional case study per project (next-mdx-remote rendered at runtime).
CREATE TABLE IF NOT EXISTS case_studies (
  id            INTEGER PRIMARY KEY,
  project_id    INTEGER REFERENCES projects(id),
  slug          TEXT UNIQUE,
  frontmatter   TEXT,            -- JSON: title, summary, stack, status, links, dates, highlights
  body_markdown TEXT,
  published     INTEGER DEFAULT 0,
  created_at    TEXT,
  updated_at    TEXT
);

-- Recruiter chat/voice sessions. State machine in §7.
CREATE TABLE IF NOT EXISTS recruiter_sessions (
  id                     TEXT PRIMARY KEY,   -- uuid
  channel                TEXT,              -- text|voice
  work_email             TEXT,
  email_domain           TEXT,
  company_domain_inferred TEXT,
  ip_hash                TEXT,              -- salted sha256
  user_agent             TEXT,
  started_at             TEXT,
  last_active_at         TEXT,
  email_verified         INTEGER DEFAULT 0,
  blocked_reason         TEXT,
  message_count          INTEGER DEFAULT 0
);

-- Full transcript: user / assistant / tool messages.
CREATE TABLE IF NOT EXISTS chat_messages (
  id          INTEGER PRIMARY KEY,
  session_id  TEXT REFERENCES recruiter_sessions(id),
  role        TEXT,              -- user|assistant|tool
  content     TEXT,
  tool_name   TEXT,
  tool_args   TEXT,              -- JSON
  tool_result TEXT,              -- JSON
  created_at  TEXT
);

-- Email-gate denylist. Builtin rows seeded from @portfolio/shared; admin rows
-- added from /admin/settings.
CREATE TABLE IF NOT EXISTS disposable_domains (
  domain    TEXT PRIMARY KEY,
  source    TEXT,                -- builtin|admin_added
  added_at  TEXT
);

-- Cookieless, server-side page-view counter (path x day). No per-visitor tracking.
CREATE TABLE IF NOT EXISTS page_views (
  id    INTEGER PRIMARY KEY,
  path  TEXT,
  day   TEXT,                    -- YYYY-MM-DD
  count INTEGER,
  UNIQUE(path, day)
);
