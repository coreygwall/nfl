import { Hono } from "hono";
import type { AppEnv } from "../env.ts";
import { callerIp } from "../env.ts";
import { badRequest, notFound } from "../errors.ts";
import { mergeCards, parseCard, type ScrambleCard } from "../../shared/golf.ts";
import { noteRateLimit, rateLimit } from "../db.ts";
import type { GolfCardResponse, PublishCardResponse } from "../../shared/api.ts";

/**
 * A scramble card, shared by its link.
 *
 * Every route here is authorised by **the token in the URL and nothing else**. That is not a
 * shortcut past the pool's sign-in; it is the feature. Four people walk up to a tee, one of them
 * has the app, and the other three need to be on the card before the group has finished arguing
 * about who is driving. Any door with a name and a code behind it loses that argument — so the
 * link *is* the credential, the way a shared document's is.
 *
 * What that costs is stated plainly rather than papered over: **anyone holding the link can edit
 * the card**, because that is what the link is for, and a link that leaks is a card a stranger can
 * scribble on. Two things keep the blast radius where it belongs. The token is 120 bits of
 * randomness, so it is found rather than guessed. And a card holds a handful of first names and
 * some golf — there is no account behind it, nothing to take, and nothing that outlives the round.
 *
 * Deliberately absent: any route that *lists* cards. There is no index, no search, no "recent",
 * and the token is the only way in. A card nobody has the link to is a row that can only be read
 * by the one person who already could.
 */
export const golfRoutes = new Hono<AppEnv>();

/**
 * 24 characters of a 32-character alphabet — 120 bits, which is the same order as a UUID and well
 * past anything that can be walked. The alphabet is the claim code's: no I, L, O, 0 or 1, because
 * this token is going to end up read off a screen and typed by somebody at least once, whatever
 * the QR code is for.
 */
const TOKEN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const TOKEN_LENGTH = 24;

export function newShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_LENGTH));
  let out = "";
  for (let i = 0; i < TOKEN_LENGTH; i += 1) out += TOKEN_ALPHABET[bytes[i]! % TOKEN_ALPHABET.length];
  return out;
}

/** Cheap enough to check before spending a database read on a token somebody mistyped. */
export function isShareTokenShaped(raw: unknown): boolean {
  return typeof raw === "string" && raw.length === TOKEN_LENGTH && [...raw].every((ch) => TOKEN_ALPHABET.includes(ch));
}

/**
 * How many cards one address may publish in an hour. A foursome sets up one card; a group that
 * starts over a few times because somebody's name was wrong is still nowhere near this. It exists
 * because publishing needs no account — the app has a session per *pool*, and a person can own a
 * golf card without being in one — so the only thing between this route and a script is the ceiling.
 */
const PUBLISHES_PER_HOUR = 20;
const PUBLISH_WINDOW_MINUTES = 60;

/**
 * A card is somebody's afternoon, not a payload to be generous about. 256KB is roughly two hundred
 * eighteen-hole rounds' worth of strokes, so the limit only ever catches something that is not a
 * card at all.
 */
const MAX_CARD_BYTES = 256 * 1024;

interface CardRow {
  id: string;
  share_token: string;
  doc: string;
  created_at: string;
  updated_at: string;
  revision: number;
}

async function rowByToken(db: D1Database, token: string): Promise<CardRow | null> {
  return await db.prepare("SELECT * FROM golf_cards WHERE share_token = ?").bind(token).first<CardRow>();
}

async function rowById(db: D1Database, id: string): Promise<CardRow | null> {
  return await db.prepare("SELECT * FROM golf_cards WHERE id = ?").bind(id).first<CardRow>();
}

/**
 * The card as stored, or null if the row holds something this build cannot read.
 *
 * `parseCard` already defaults rather than throwing, so this is only ever null for a genuinely
 * corrupt row — and the caller treats that as "no such card" rather than a 500, because a person
 * holding a link cannot do anything with either answer and one of them is frightening.
 */
function storedCard(row: CardRow): ScrambleCard | null {
  try {
    return parseCard(JSON.parse(row.doc));
  } catch {
    return null;
  }
}

function cardFrom(body: unknown): ScrambleCard {
  const raw = (body as { card?: unknown } | null)?.card;
  const card = parseCard(raw);
  if (!card) throw badRequest("BAD_CARD", "That doesn't look like a golf card.");
  return card;
}

function payload(row: CardRow, card: ScrambleCard): GolfCardResponse {
  return { token: row.share_token, revision: row.revision, updatedAt: row.updated_at, card };
}

/**
 * Publish a card, or ask for its link back.
 *
 * Idempotent by card id on purpose: the app's *Share* button calls this every time it is tapped,
 * and a second tap has to produce the same link as the first. A pool that minted a new token per
 * tap would leave the group chat holding three links to one round, two of which nobody can revoke
 * because nobody remembers they exist.
 *
 * Publishing an already-published card also merges rather than overwrites, because the phone doing
 * the publishing may well be behind: somebody opened the link and played two holes while the app
 * was in a pocket.
 */
golfRoutes.post("/cards", async (c) => {
  const now = c.get("now");
  const raw = await c.req.text();
  if (raw.length > MAX_CARD_BYTES) throw badRequest("CARD_TOO_BIG", "That card is too large to share.");
  const card = cardFrom(JSON.parse(raw || "{}"));

  const existing = await rowById(c.env.DB, card.id);
  if (existing) {
    const merged = mergeCards(storedCard(existing) ?? card, card);
    const revision = existing.revision + 1;
    await c.env.DB.prepare("UPDATE golf_cards SET doc = ?, updated_at = ?, revision = ? WHERE id = ?")
      .bind(JSON.stringify(merged), now, revision, card.id)
      .run();
    return c.json<PublishCardResponse>({
      ...payload({ ...existing, updated_at: now, revision }, merged),
      created: false,
    });
  }

  // Only a *new* card costs a slot. Republishing is the same round, and rate-limiting it would
  // punish the group whose afternoon is going well.
  const limitKey = `golf-publish:${callerIp(c.req.raw.headers)}`;
  const seen = await rateLimit(c.env.DB, limitKey, now);
  if (seen.count >= PUBLISHES_PER_HOUR) {
    throw badRequest("TOO_MANY_CARDS", "That's a lot of cards. Try again in a little while.");
  }
  const resetAt = seen.resetAt ?? new Date(Date.parse(now) + PUBLISH_WINDOW_MINUTES * 60_000).toISOString();
  await noteRateLimit(c.env.DB, limitKey, seen.count + 1, resetAt, now);

  // The unique index is what actually prevents a collision; this is the loop that survives losing.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = newShareToken();
    try {
      await c.env.DB.prepare(
        "INSERT INTO golf_cards (id, share_token, doc, created_at, updated_at, revision) VALUES (?, ?, ?, ?, ?, 1)",
      )
        .bind(card.id, token, JSON.stringify(card), now, now)
        .run();
      return c.json<PublishCardResponse>({ token, revision: 1, updatedAt: now, card, created: true });
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      if (!/UNIQUE|constraint/i.test(text)) throw err;
      // Losing on the *id* means two devices published the same card at once — the other one won,
      // and its token is the one to hand back.
      const raced = await rowById(c.env.DB, card.id);
      if (raced) return c.json<PublishCardResponse>({ ...payload(raced, storedCard(raced) ?? card), created: false });
    }
  }
  throw badRequest("NO_TOKEN", "Couldn't make a link for that card. Try again.");
});

/** Read a card. The one route a link-holder calls before they have done anything. */
golfRoutes.get("/cards/:token", async (c) => {
  const token = c.req.param("token");
  if (!isShareTokenShaped(token)) throw notFound("NO_CARD", "That link doesn't point at a card.");
  const row = await rowByToken(c.env.DB, token);
  const card = row ? storedCard(row) : null;
  if (!row || !card) throw notFound("NO_CARD", "That card isn't here. The link may have been mistyped.");
  return c.json<GolfCardResponse>(payload(row, card));
});

/**
 * Write a card back.
 *
 * The merge happens **here**, on the stored copy, rather than on whichever client got there first.
 * That is the only place it can be correct: two browsers and a phone all hold a version of the
 * same afternoon, and each of them thinks its own is current. The server is the one party that
 * sees both, so it applies `mergeCards` — the hole is the unit, newest wins — and answers with the
 * result. A client's job is to take that answer as the truth rather than to argue with it.
 *
 * Which means a push can legitimately come back holding strokes the pusher never logged, and that
 * is the feature working: somebody else was playing while you were.
 */
golfRoutes.put("/cards/:token", async (c) => {
  const now = c.get("now");
  const token = c.req.param("token");
  if (!isShareTokenShaped(token)) throw notFound("NO_CARD", "That link doesn't point at a card.");
  const raw = await c.req.text();
  if (raw.length > MAX_CARD_BYTES) throw badRequest("CARD_TOO_BIG", "That card is too large to save.");
  const incoming = cardFrom(JSON.parse(raw || "{}"));

  const row = await rowByToken(c.env.DB, token);
  const stored = row ? storedCard(row) : null;
  if (!row || !stored) throw notFound("NO_CARD", "That card isn't here any more.");
  // The id belongs to the row, not to whoever is writing: a client sending somebody else's card
  // to this token would otherwise replace this round with that one.
  if (incoming.id !== stored.id) throw badRequest("WRONG_CARD", "That's a different card.");

  const merged = mergeCards(stored, incoming);
  const revision = row.revision + 1;
  await c.env.DB.prepare("UPDATE golf_cards SET doc = ?, updated_at = ?, revision = ? WHERE share_token = ?")
    .bind(JSON.stringify(merged), now, revision, token)
    .run();
  return c.json<GolfCardResponse>(payload({ ...row, updated_at: now, revision }, merged));
});
