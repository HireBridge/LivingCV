CREATE TABLE IF NOT EXISTS custom_themes (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  theme_json  TEXT NOT NULL,
  created_at  TEXT,
  updated_at  TEXT
);
