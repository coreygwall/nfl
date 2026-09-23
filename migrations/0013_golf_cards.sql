-- A golf card that has left the phone it was kept on.
--
-- Until now a scramble card was local and only local: `CardCatalog` in UserDefaults, one phone,
-- one afternoon. That is fine right up to the moment somebody who is playing does not have the
-- app, which is most of the time — three of the four people round a card are holding a phone with
-- a browser on it and nothing else. Publishing a card puts it here and hands back a link.
--
-- The whole card is one JSON document rather than a table of holes and a table of strokes, and
-- that is deliberate on two counts. The shape is already defined twice, in Swift and in
-- `shared/golf.ts`, and a third definition in DDL is a third place to forget a field. And nothing
-- here is ever queried *across* cards: there is no leaderboard of everybody's rounds, no report,
-- no join. Every read is one row by its token, which is exactly what a document is good at. If a
-- query across cards ever becomes a real requirement, that is the day to normalise it.
--
-- `share_token` is the whole security model, so it is a column of its own rather than the primary
-- key: the card keeps the id the phone gave it, and the capability can be replaced without the
-- card becoming a different card.
CREATE TABLE IF NOT EXISTS golf_cards (
  id TEXT PRIMARY KEY,
  share_token TEXT NOT NULL,
  doc TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  -- Bumped on every accepted write. A client that holds the revision it last saw can tell "my
  -- push changed nothing" from "somebody else has been playing" without diffing two cards.
  revision INTEGER NOT NULL DEFAULT 1
);

-- Two cards answering to one token would be one person's round opening somebody else's. The index
-- is what makes the mint's retry loop correct rather than hopeful, the same as the pool codes'.
CREATE UNIQUE INDEX IF NOT EXISTS golf_cards_share_token ON golf_cards(share_token);

-- Republishing is by card id — the phone that owns it asks for its own link back rather than
-- minting a second one — so that lookup is a primary-key read and needs no index of its own.
