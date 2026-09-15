-- Pool-scoped conversation storage. Broadcast-only policy is the first supported mode.
CREATE TABLE IF NOT EXISTS pool_communication_settings (
  pool_id TEXT PRIMARY KEY REFERENCES pools(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  posting_policy TEXT NOT NULL DEFAULT 'commissioners' CHECK (posting_policy IN ('commissioners', 'members'))
);
CREATE TABLE IF NOT EXISTS pool_messages (
  id TEXT PRIMARY KEY,
  pool_id TEXT NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  author_account_id TEXT REFERENCES players(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  author_role TEXT NOT NULL DEFAULT 'commissioner',
  parent_id TEXT REFERENCES pool_messages(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS pool_messages_feed ON pool_messages(pool_id, created_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS pool_message_reactions (
  message_id TEXT NOT NULL REFERENCES pool_messages(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL DEFAULT 'like' CHECK (reaction = 'like'),
  PRIMARY KEY (message_id, account_id, reaction)
);
