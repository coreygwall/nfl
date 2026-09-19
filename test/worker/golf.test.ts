import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { GolfCardResponse, PublishCardResponse } from "../../shared/api.ts";
import { STANDARD_PARS, type ScrambleCard } from "../../shared/golf.ts";

/**
 * A card that has left the phone.
 *
 * What is being proved here is not the golf — `golf.test.ts` does that — but the two things only
 * the Worker can get wrong: that the link is the *whole* credential and works without any session,
 * and that a write **merges** rather than overwrites. The second is the one that costs somebody
 * their afternoon: two browsers and a phone are all holding a version of the same round, each
 * convinced its own is current, and the server is the only party that sees both.
 */
const NOW = "2026-09-19T12:00:00.000Z";
const at = (minutes: number) => new Date(Date.parse(NOW) + minutes * 60_000).toISOString();

async function golf<T>(path: string, opts: { method?: string; body?: unknown; now?: string } = {}) {
  const url = new URL(`http://pool.test/api/golf${path}`);
  url.searchParams.set("now", opts.now ?? NOW);
  const res = await SELF.fetch(url, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: { "content-type": "application/json" },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as T };
}

let seq = 0;
function card(overrides: Partial<ScrambleCard> = {}): ScrambleCard {
  return {
    id: `card-${Date.now().toString(36)}-${seq++}`,
    name: "Saturday scramble",
    course: "Blue Hill",
    createdAt: NOW,
    settingsUpdatedAt: NOW,
    players: [
      { id: "c", name: "Corey" },
      { id: "d", name: "Dan" },
      { id: "p", name: "Pete" },
      { id: "s", name: "Sam" },
    ],
    pars: STANDARD_PARS,
    holes: [],
    contests: { longestDrive: true, closestToPin: true },
    points: {
      enabled: true,
      shotKept: { on: false, each: 0 },
      longestDrive: { on: true, each: 10 },
      closestToPin: { on: true, each: 10 },
    },
    ...overrides,
  };
}

const hole = (n: number, playerId: string, when: string) => ({
  hole: n,
  strokes: [{ id: `s${n}-${playerId}`, kind: "shot" as const, playerId }],
  finished: true,
  updatedAt: when,
  awards: [],
});

async function publish(c: ScrambleCard) {
  const res = await golf<PublishCardResponse>("/cards", { body: { card: c } });
  expect(res.status).toBe(200);
  return res.body;
}

describe("publishing a golf card", () => {
  it("hands back a link, with no session of any kind", async () => {
    const published = await publish(card());
    expect(published.created).toBe(true);
    expect(published.token).toMatch(/^[A-HJ-NP-Z2-9]{24}$/);
    expect(published.revision).toBe(1);
    expect(published.card.name).toBe("Saturday scramble");
  });

  /**
   * The app's Share button calls this every time it is tapped. A second tap that minted a second
   * token would leave the group chat holding two links to one round.
   */
  it("gives the same card back the same link", async () => {
    const mine = card();
    const first = await publish(mine);
    const second = await publish(mine);
    expect(second.token).toBe(first.token);
    expect(second.created).toBe(false);
  });

  it("refuses something that is not a card", async () => {
    const noPlayers = await golf("/cards", { body: { card: { ...card(), players: [] } } });
    expect(noPlayers.status).toBe(400);
    const nothing = await golf("/cards", { body: {} });
    expect(nothing.status).toBe(400);
  });
});

describe("reading a card by its link", () => {
  it("opens for anybody holding the token", async () => {
    const published = await publish(card());
    const read = await golf<GolfCardResponse>(`/cards/${published.token}`);
    expect(read.status).toBe(200);
    expect(read.body.card.id).toBe(published.card.id);
    expect(read.body.card.players.map((p) => p.name)).toEqual(["Corey", "Dan", "Pete", "Sam"]);
  });

  /** The only answer a stranger can get. There is no listing route to find a real one from. */
  it("is a flat 404 for a token that is not one", async () => {
    expect((await golf("/cards/NOPE")).status).toBe(404);
    expect((await golf("/cards/ABCDEFGHJKMNPQRSTUVWXYZ2")).status).toBe(404);
  });
});

describe("writing a card back", () => {
  /**
   * The case the whole merge exists for: a phone in a pocket and a browser on the next tee. Each
   * sends a card that is missing the other's hole, and neither may lose it.
   */
  it("keeps both holes when two people played different ones", async () => {
    const base = card();
    const published = await publish(base);

    const fromPhone = { ...base, holes: [hole(1, "c", at(1))] };
    const fromBrowser = { ...base, holes: [hole(2, "d", at(2))] };

    const first = await golf<GolfCardResponse>(`/cards/${published.token}`, { method: "PUT", body: { card: fromPhone } });
    expect(first.status).toBe(200);
    const second = await golf<GolfCardResponse>(`/cards/${published.token}`, { method: "PUT", body: { card: fromBrowser } });
    expect(second.status).toBe(200);
    expect(second.body.card.holes.map((h) => h.hole)).toEqual([1, 2]);
    expect(second.body.revision).toBe(3);
  });

  it("gives one hole to whoever wrote it last, whichever order they arrive in", async () => {
    const base = card();
    const published = await publish(base);
    const early = { ...base, holes: [hole(1, "c", at(1))] };
    const late = { ...base, holes: [hole(1, "d", at(9))] };

    await golf(`/cards/${published.token}`, { method: "PUT", body: { card: late } });
    const after = await golf<GolfCardResponse>(`/cards/${published.token}`, { method: "PUT", body: { card: early } });
    expect(after.body.card.holes[0]!.strokes[0]!.playerId).toBe("d");
  });

  it("moves the settings on their own clock", async () => {
    const base = card();
    const published = await publish(base);
    await golf(`/cards/${published.token}`, { method: "PUT", body: { card: { ...base, holes: [hole(1, "c", at(1))] } } });
    const renamed = { ...base, name: "Sunday scramble", settingsUpdatedAt: at(5) };
    const after = await golf<GolfCardResponse>(`/cards/${published.token}`, { method: "PUT", body: { card: renamed } });
    expect(after.body.card.name).toBe("Sunday scramble");
    // Renaming must not wipe the round: the settings and the holes move on separate clocks.
    expect(after.body.card.holes.map((h) => h.hole)).toEqual([1]);
  });

  /** A token names one round. Writing a different card to it would replace somebody's afternoon. */
  it("refuses a card that is not the one this link points at", async () => {
    const published = await publish(card());
    const res = await golf(`/cards/${published.token}`, { method: "PUT", body: { card: card() } });
    expect(res.status).toBe(400);
  });

  it("is a 404 rather than a create for a token that does not exist", async () => {
    const res = await golf(`/cards/ABCDEFGHJKMNPQRSTUVWXYZ2`, { method: "PUT", body: { card: card() } });
    expect(res.status).toBe(404);
  });

  /**
   * Publishing after somebody has played is the phone catching up, not overwriting. The app calls
   * this whenever the share sheet opens, which may well be after two holes have gone in elsewhere.
   */
  it("merges rather than overwrites when the app republishes a stale card", async () => {
    const base = card();
    const published = await publish(base);
    await golf(`/cards/${published.token}`, { method: "PUT", body: { card: { ...base, holes: [hole(4, "p", at(3))] } } });

    const again = await publish(base);
    expect(again.created).toBe(false);
    expect(again.card.holes.map((h) => h.hole)).toEqual([4]);
  });
});

describe("a card is not part of the web", () => {
  /**
   * It is reachable by its link and by nothing else, so it must never end up in a search result —
   * and that has to hold for every answer the prefix gives, not only the page that loads. There is
   * no assets binding under test, so what this pins is the header rather than the document; the
   * file's own contents are checked in `golfRobots.test.ts`.
   */
  it("answers every /g/ URL with noindex, whatever it answers", async () => {
    for (const path of ["/g", "/g/ABCDEFGHJKMNPQRSTUVWXYZ2", "/g/nope/deeper"]) {
      const res = await SELF.fetch(`http://pool.test${path}`);
      expect(res.headers.get("x-robots-tag"), path).toContain("noindex");
      expect(res.headers.get("cache-control"), path).toContain("no-store");
    }
  });

  /** And nothing else on the site picks the rule up by accident. */
  it("leaves the pool's own pages indexable", async () => {
    const res = await SELF.fetch("http://pool.test/api/health");
    expect(res.headers.get("x-robots-tag")).toBeNull();
  });
});
