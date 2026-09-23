import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { uniqueName } from "./names.ts";
import { WEEKS } from "../../shared/week.ts";

const BEFORE = "2026-09-09T12:00:00.000Z";
const pin = "1234";

async function api<T = any>(path: string, opts: { player?: string; pin?: string; now?: string; body?: unknown; method?: string } = {}): Promise<{ status: number; body: T }> {
  const url = new URL(`http://pool.test/api${path}`);
  url.searchParams.set("now", opts.now ?? BEFORE);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.player) headers["x-player-token"] = opts.player;
  if (opts.pin) headers["x-admin-pin"] = opts.pin;
  const res = await SELF.fetch(url, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as T };
}

async function newPlayer(prefix: string): Promise<{ id: string; name: string; token: string }> {
  const name = uniqueName(prefix);
  const { status, body } = await api("/players", { body: { name } });
  expect(status).toBe(201);
  return { ...body.player, token: body.token };
}

/** Sets a result on every game of a week, the winner alternating so callers can pick who "wins" it. */
async function settle(week: number, winner: (gameId: string, away: string, home: string) => string | null): Promise<{ id: string; away: string; home: string }[]> {
  const { body } = await api(`/weeks/${week}`, { now: BEFORE });
  const games = body.games as { id: string; away: string; home: string }[];
  for (const g of games) {
    const w = winner(g.id, g.away, g.home);
    await api(`/league/games/${g.id}/result`, { method: "PUT", body: { winner: w }, pin });
  }
  return games;
}

const DONE = "2026-12-31T12:00:00.000Z"; // after every week's kickoffs

describe("winnings", () => {
  it("gives a week's whole pot to whoever is alone in first, once it is final", async () => {
    const p1 = await newPlayer("Solo");
    const p2 = await newPlayer("Bystander");
    const games = await settle(6, (id, away) => away); // every away team wins
    await api("/weeks/6/picks", { method: "PUT", body: { picks: [{ gameId: games[0]!.id, team: games[0]!.away, rank: 1 }] }, player: p1.token });
    // p2 never picks, so they cannot have won it.

    const board = await api("/board/winnings", { now: DONE });
    const row1 = board.body.rows.find((r: any) => r.playerId === p1.id);
    const row2 = board.body.rows.find((r: any) => r.playerId === p2.id);
    expect(row1).toMatchObject({ weekly: 18, weeksWon: 1, total: 18 });
    expect(row2).toMatchObject({ weekly: 0, weeksWon: 0, total: 0 });
    expect(board.body.weeks).toContainEqual({ week: 6, winnerIds: [p1.id], winnerNames: [p1.name], share: 18 });
  });

  it("splits a tied week evenly between everyone level at the top", async () => {
    const p1 = await newPlayer("TieA");
    const p2 = await newPlayer("TieB");
    const p3 = await newPlayer("TieLoser");
    const games = await settle(7, (id, away) => away);
    const g0 = games[0]!;
    for (const p of [p1, p2]) {
      await api("/weeks/7/picks", { method: "PUT", body: { picks: [{ gameId: g0.id, team: g0.away, rank: 1 }] }, player: p.token });
    }
    await api("/weeks/7/picks", { method: "PUT", body: { picks: [{ gameId: g0.id, team: g0.home, rank: 1 }] }, player: p3.token });

    const board = await api("/board/winnings", { now: DONE });
    const row1 = board.body.rows.find((r: any) => r.playerId === p1.id);
    const row2 = board.body.rows.find((r: any) => r.playerId === p2.id);
    const row3 = board.body.rows.find((r: any) => r.playerId === p3.id);
    expect(row1.weekly).toBe(9);
    expect(row2.weekly).toBe(9);
    expect(row3.weekly).toBe(0);
    const settled = board.body.weeks.find((w: any) => w.week === 7);
    expect(settled.share).toBe(9);
    expect(new Set(settled.winnerIds)).toEqual(new Set([p1.id, p2.id]));
  });

  it("withholds the season pot until the season's last week is final, then splits it", async () => {
    const p1 = await newPlayer("SeasonLeader");
    const p2 = await newPlayer("SeasonField");

    const early = await api("/board/winnings", { now: DONE });
    expect(early.body.seasonSettled).toBe(false);
    expect(early.body.rows.find((r: any) => r.playerId === p1.id).season).toBe(0);

    const games = await settle(WEEKS, (id, away) => away);
    // Three correct picks (5+4+3=12) rather than one, so this leader clears whatever the season
    // standings already hold from earlier tests in this file — season points accumulate from
    // every counted week, and this file's other tests both play a counted week of their own.
    const top3 = games.slice(0, 3).map((g, i) => ({ gameId: g.id, team: g.away, rank: i + 1 }));
    await api(`/weeks/${WEEKS}/picks`, { method: "PUT", body: { picks: top3 }, player: p1.token });
    await api(`/weeks/${WEEKS}/picks`, { method: "PUT", body: { picks: [{ gameId: games[0]!.id, team: games[0]!.home, rank: 1 }] }, player: p2.token });

    const settled = await api("/board/winnings", { now: DONE });
    expect(settled.body.seasonSettled).toBe(true);
    const leader = settled.body.rows.find((r: any) => r.playerId === p1.id);
    expect(leader.season).toBe(51);
    expect(leader.total).toBe(leader.weekly + 51);
    expect(settled.body.rows.find((r: any) => r.playerId === p2.id).season).toBe(0);
  });
});
