-- NFL confidence pool schema. All timestamps are ISO-8601 UTC strings (Date.toISOString()).
CREATE TABLE IF NOT EXISTS players (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  name_key     TEXT NOT NULL UNIQUE,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS games (
  id                TEXT PRIMARY KEY,
  season            INTEGER NOT NULL,
  week              INTEGER NOT NULL CHECK (week BETWEEN 1 AND 18),
  kickoff_at        TEXT NOT NULL,
  away              TEXT NOT NULL,
  home              TEXT NOT NULL,
  neutral           INTEGER NOT NULL DEFAULT 0,
  venue             TEXT,
  winner            TEXT,
  away_score        INTEGER,
  home_score        INTEGER,
  result_updated_at TEXT,
  CHECK (winner IS NULL OR winner = 'TIE' OR winner = away OR winner = home),
  UNIQUE (id, week)
);
CREATE INDEX IF NOT EXISTS games_season_week_kickoff ON games(season, week, kickoff_at);

CREATE TABLE IF NOT EXISTS picks (
  player_id  TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  game_id    TEXT NOT NULL,
  week       INTEGER NOT NULL,
  team       TEXT NOT NULL,
  rank       INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 5),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (player_id, game_id),
  UNIQUE (player_id, week, rank),
  FOREIGN KEY (game_id, week) REFERENCES games(id, week)
);
CREATE INDEX IF NOT EXISTS picks_week ON picks(week, game_id);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
