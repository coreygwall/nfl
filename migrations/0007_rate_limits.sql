-- Two things a stranger with the pool's link can hammer: the admin PIN, and the signup form that
-- puts a name on the roster. Both are counted per caller here — a wrong PIN counts failures until
-- a cool-off, a signup counts names inside a window — so neither can be run in a loop, and neither
-- can be used to lock the commissioner or anybody else out.
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  reset_at TEXT,
  last_at TEXT NOT NULL
);
