-- Ownership is persistent, not a device-local collection of sign-ins.
CREATE TABLE IF NOT EXISTS entry_owners (
  player_id TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES players(id) ON DELETE RESTRICT,
  CHECK (player_id <> owner_id)
);
CREATE INDEX IF NOT EXISTS entry_owners_owner ON entry_owners(owner_id);
