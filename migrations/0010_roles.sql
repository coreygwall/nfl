-- Who runs a pool, and who runs the league.
--
-- Until now one PIN opened everything: the roster, the settings, and the winner of every NFL game.
-- Those are two different jobs. A commissioner runs their own pool — the roster, the name, the
-- invite, the nudges. Results are not theirs: every pool scores the same fourteen games, so there
-- is exactly one authority on who won, and it sits above every pool rather than inside one.
--
-- The pool is a row now rather than three environment variables. There is still only one of it,
-- but a commissioner has something to be the commissioner *of*, and the day pools are created in
-- the app is a second INSERT rather than a rewrite.

CREATE TABLE IF NOT EXISTS pools (
  id         TEXT PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL,
  season     INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT REFERENCES players(id) ON DELETE SET NULL
);

-- An account can commission more than one pool, and a pool can have more than one commissioner
-- (a co-commissioner is the usual reason). The grant is always against an account — never a
-- managed entry — so switching to your kid's entry does not switch the office off.
CREATE TABLE IF NOT EXISTS pool_commissioners (
  pool_id    TEXT NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  player_id  TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  granted_at TEXT NOT NULL,
  granted_by TEXT,
  PRIMARY KEY (pool_id, player_id)
);
CREATE INDEX IF NOT EXISTS pool_commissioners_player ON pool_commissioners(player_id);

-- The league office: results, the schedule, the feed. Nothing to do with any one pool.
CREATE TABLE IF NOT EXISTS platform_admins (
  player_id  TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  granted_at TEXT NOT NULL,
  granted_by TEXT
);

-- A name that has never been claimed is claimed on sight — that is how a pre-created roster
-- onboards. A name whose access the commissioner *reset* has been claimed before, so it goes back
-- to needing the code even though its device count is zero.
ALTER TABLE players ADD COLUMN claim_requires_code INTEGER NOT NULL DEFAULT 0;

-- Who typed a pick. It used to be inferred from the device: a pick was "the commissioner's" if it
-- came from a token the commissioner had minted for somebody else's name. That capability is gone,
-- so the fact is recorded on the pick itself, where it belonged.
ALTER TABLE picks ADD COLUMN entered_by TEXT NOT NULL DEFAULT 'player';

UPDATE picks SET entered_by = 'commissioner'
 WHERE device_id IN (SELECT id FROM devices WHERE issued_by = 'admin');
