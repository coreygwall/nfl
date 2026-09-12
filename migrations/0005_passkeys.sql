-- Face ID / Touch ID sign-in. Optional: a pool still works with a name and a device code.

CREATE TABLE IF NOT EXISTS passkeys (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  -- The domain the passkey was created for; a credential from one host is not offered on another.
  rp_id TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS passkeys_player ON passkeys(player_id);

CREATE TABLE IF NOT EXISTS passkey_challenges (
  id TEXT PRIMARY KEY,
  player_id TEXT,
  challenge TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
