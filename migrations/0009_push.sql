-- Push notifications. A token belongs to one install of the app on one device, and carries the
-- entries that install wants to hear about: someone running three entries gets three messages when
-- a slate settles, because each one is its own story.

CREATE TABLE IF NOT EXISTS push_tokens (
  -- The APNs device token, hex. Apple reissues these, so it is the identity, not a surrogate key.
  token TEXT PRIMARY KEY,
  -- Which Apple push host to use. A build signed for development can only be reached on the
  -- sandbox host and vice versa; getting this wrong is silent, so the app tells us which it is.
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  -- The account the install is signed in as, if any. Entries are resolved through this at send
  -- time so that adding an entry on the web starts notifying the phone with no app round trip.
  account_id TEXT REFERENCES players(id) ON DELETE CASCADE,
  -- The entry this install is signed in as, when it is a plain device with no account.
  player_id TEXT REFERENCES players(id) ON DELETE CASCADE,
  -- What the person opted into, as a JSON object. Absent keys mean on.
  prefs TEXT NOT NULL DEFAULT '{}',
  app_version TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  -- Set when Apple tells us the token is dead. Kept briefly rather than deleted so a re-register
  -- from the same install is an update rather than a resurrection with no history.
  retired_at TEXT
);

CREATE INDEX IF NOT EXISTS push_tokens_account ON push_tokens(account_id);
CREATE INDEX IF NOT EXISTS push_tokens_player ON push_tokens(player_id);

-- One row per thing we have said, so a cron that runs every half hour says it once. The id carries
-- everything that makes a message distinct: the entry, and the moment in the season it is about.
CREATE TABLE IF NOT EXISTS notifications_sent (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  player_id TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  -- How many devices took it, for a sense of whether it landed.
  delivered INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS notifications_sent_at ON notifications_sent(sent_at);

-- The live activity a phone is showing for a week, so the worker can push it updates and end it.
CREATE TABLE IF NOT EXISTS live_activities (
  -- The ActivityKit push token, hex.
  token TEXT PRIMARY KEY,
  environment TEXT NOT NULL CHECK (environment IN ('sandbox', 'production')),
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  ended_at TEXT
);

CREATE INDEX IF NOT EXISTS live_activities_week ON live_activities(week, player_id);
