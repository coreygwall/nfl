-- Identity, phase one: a name is claimed by a device, and a short code moves it to another one.
-- Statements run one at a time; "duplicate column name" is treated as already-applied.

ALTER TABLE players ADD COLUMN claim_code TEXT;
ALTER TABLE players ADD COLUMN claim_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN claim_locked_until TEXT;

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  -- SHA-256 of the token the device holds; the raw token is shown once and never stored.
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS devices_player ON devices(player_id);
