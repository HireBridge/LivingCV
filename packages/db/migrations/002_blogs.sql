CREATE TABLE IF NOT EXISTS blogs (
  id            INTEGER PRIMARY KEY,
  slug          TEXT UNIQUE,
  title         TEXT,
  summary       TEXT,
  body_markdown TEXT,
  published     INTEGER DEFAULT 0,
  created_at    TEXT,
  updated_at    TEXT
);
