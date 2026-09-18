-- The short code you say out loud to get somebody into a pool.
--
-- A pool has had exactly one way in since the beginning: its link. That works when the invite
-- arrives in a message you can tap, and not at all when it arrives across a table — nobody reads
-- "playtally.app slash p slash high dash five" to a friend. The code is that second way: three
-- letters and three digits, `KDP-472`, generated once per pool and never rotated by itself.
--
-- Nullable rather than NOT NULL DEFAULT, because a default would have to be a literal and every
-- pool would share it. The Worker mints one for any row that lacks it the first time it looks the
-- pool up, which covers the row that already exists in production as well as every row made
-- before this column did.
ALTER TABLE pools ADD COLUMN join_code TEXT;

-- Two pools answering to one code is the one failure that matters: the index is what makes the
-- mint's retry loop correct rather than hopeful.
CREATE UNIQUE INDEX IF NOT EXISTS pools_join_code ON pools(join_code) WHERE join_code IS NOT NULL;
