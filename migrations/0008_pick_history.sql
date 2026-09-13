-- Every set of picks ever saved, kept forever. Deliberately not a foreign key to players or
-- games: the whole point is that it outlives a deleted player, which is the likeliest way picks
-- vanish — one wrong tap in /admin takes a player, their entries, and every pick they made.
--
-- D1's own point-in-time recovery would not help there. Rolling the database back to before the
-- mistake also throws away every pick everyone else made in between, which on a Sunday is a worse
-- outcome than the thing being fixed. This table lets one person's picks be put back exactly,
-- without touching anyone else's.
--
-- Append only. Nothing in the app ever updates or deletes a row here.
CREATE TABLE IF NOT EXISTS pick_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  saved_at TEXT NOT NULL,
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  week INTEGER NOT NULL,
  game_id TEXT NOT NULL,
  team TEXT NOT NULL,
  rank INTEGER NOT NULL,
  device_id TEXT
);

CREATE INDEX IF NOT EXISTS pick_history_player ON pick_history(player_id, week, saved_at);
CREATE INDEX IF NOT EXISTS pick_history_saved ON pick_history(saved_at);
