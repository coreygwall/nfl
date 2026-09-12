-- Commissioner-only bookkeeping: who is squared away for the season and who still owes you
-- a nudge. Never leaves the admin API.

ALTER TABLE players ADD COLUMN ready INTEGER NOT NULL DEFAULT 0;

ALTER TABLE players ADD COLUMN ready_at TEXT;
