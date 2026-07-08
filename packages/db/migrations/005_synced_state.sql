CREATE TABLE IF NOT EXISTS synced_state (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  source     TEXT,
  synced_at  TEXT NOT NULL
);
