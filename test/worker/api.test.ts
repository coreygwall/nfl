import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BEFORE = "2026-09-09T12:00:00.000Z"; // Wed morning, nothing started
const AFTER_OPENER = "2026-09-10T03:00:00.000Z"; // NE @ SEA has kicked off, nothing else has
const AFTER_WEEK1 = "2026-09-16T12:00:00.000Z"; // week 1 done

interface Opts {
  player?: string;
  pin?: string;
  now?: string;
  body?: unknown;
  method?: string;
}

async function api<T = any>(path: string, opts: Opts = {}): Promise<{ status: number; body: T }> {
  const url = new URL(`http://pool.test/api${path}`);
  if (opts.now) url.searchParams.set("now", opts.now);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.player) headers["x-player-id"] = opts.player;
  if (opts.pin) headers["x-admin-pin"] = opts.pin;
  const res = await SELF.fetch(url, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as T };
}

let seq = 0;
async function newPlayer(prefix = "Player"): Promise<{ id: string; name: string }> {
  const name = `${prefix} ${Date.now().toString(36)}${(seq++).toString(36)}`;
  const { status, body } = await api("/players", { body: { name } });
  expect(status).toBe(201);
  return body.player;
}

describe("bootstrap & players", () => {
  it("serves health and bootstrap with the seeded schedule", async () => {
    const health = await api("/health");
    expect(health.body.ok).toBe(true);
    const { status, body } = await api("/bootstrap", { now: BEFORE });
    expect(status).toBe(200);
    expect(body.season).toBe(2026);
    expect(body.poolName).toBe("Test Pool");
    expect(body.currentWeek).toBe(1);
    expect(body.boardWeek).toBe(1);
    expect(body.weeks).toHaveLength(18);
    expect(body.weeks[0]).toMatchObject({ week: 1, gameCount: 16, lockedCount: 0, firstKickoff: "2026-09-10T00:20:00.000Z" });
    expect(body.me).toBeNull();
    const later = await api("/bootstrap", { now: AFTER_WEEK1 });
    expect(later.body.currentWeek).toBe(2);
    expect(later.body.boardWeek).toBe(1);
  });

  it("creates players once per case-insensitive name", async () => {
    const name = `Corey ${Date.now()}`;
    const first = await api("/players", { body: { name } });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ created: true, player: { name } });
    const again = await api("/players", { body: { name: `  ${name.toUpperCase()}  ` } });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ created: false, player: { id: first.body.player.id, name } });
    const bad = await api("/players", { body: { name: "x" } });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("INVALID_NAME");
    const boot = await api("/bootstrap", { player: first.body.player.id });
    expect(boot.body.me).toEqual(first.body.player);
    expect(boot.body.players.some((p: any) => p.id === first.body.player.id)).toBe(true);
  });
});

describe("weeks & picks", () => {
  it("lists a week with lock state and validates week numbers", async () => {
    const { body } = await api("/weeks/1", { now: AFTER_OPENER });
    expect(body.games).toHaveLength(16);
    const opener = body.games.find((g: any) => g.id === "2026_01_NE_SEA");
    expect(opener).toMatchObject({ locked: true, status: "live", away: "NE", home: "SEA" });
    expect(body.games.filter((g: any) => g.locked)).toHaveLength(1);
    expect((await api("/weeks/19")).status).toBe(400);
    expect((await api("/weeks/abc")).status).toBe(400);
  });

  it("requires a player to submit picks", async () => {
    const { status, body } = await api("/weeks/1/picks", { method: "PUT", body: { picks: [] } });
    expect(status).toBe(401);
    expect(body.error.code).toBe("NO_PLAYER");
  });

  it("saves, replaces, freezes and reveals picks through the week", async () => {
    const corey = await newPlayer("Corey");
    const alex = await newPlayer("Alex");
    const picks = [
      { gameId: "2026_01_NE_SEA", team: "SEA", rank: 1 },
      { gameId: "2026_01_SF_LA", team: "SF", rank: 2 },
      { gameId: "2026_01_BUF_HOU", team: "BUF", rank: 3 },
      { gameId: "2026_01_TB_CIN", team: "CIN", rank: 4 },
      { gameId: "2026_01_NO_DET", team: "DET", rank: 5 },
    ];
    const saved = await api("/weeks/1/picks", { method: "PUT", body: { picks }, player: corey.id, now: BEFORE });
    expect(saved.status).toBe(200);
    expect(saved.body.picks).toEqual(picks);

    const mine = await api("/weeks/1", { player: corey.id, now: BEFORE });
    expect(mine.body.myPicks).toEqual(picks);
    expect(mine.body.submitted).toBeGreaterThanOrEqual(1);
    expect(mine.body.pickCounts).toEqual({}); // nothing kicked off -> no tallies

    // Alex can't see Corey's picks before kickoff, but sees that 5 were made.
    const boardBefore = await api("/board/week/1", { player: alex.id, now: BEFORE });
    const coreyRow = boardBefore.body.rows.find((r: any) => r.playerId === corey.id);
    expect(coreyRow).toMatchObject({ picksMade: 5, points: 0, possible: 15, picks: [] });

    // Replace freely before kickoff.
    const replaced = await api("/weeks/1/picks", {
      method: "PUT",
      body: { picks: [{ gameId: "2026_01_NE_SEA", team: "SEA", rank: 1 }, { gameId: "2026_01_CHI_CAR", team: "CHI", rank: 2 }] },
      player: corey.id,
      now: BEFORE,
    });
    expect(replaced.status).toBe(200);
    expect(replaced.body.picks).toHaveLength(2);

    // After the opener kicks off the SEA pick is frozen.
    const reRank = await api("/weeks/1/picks", {
      method: "PUT",
      body: { picks: [{ gameId: "2026_01_NE_SEA", team: "SEA", rank: 2 }, { gameId: "2026_01_CHI_CAR", team: "CHI", rank: 1 }] },
      player: corey.id,
      now: AFTER_OPENER,
    });
    expect(reRank.status).toBe(409);
    expect(reRank.body.error.code).toBe("GAME_LOCKED");
    expect(reRank.body.error.details.gameIds).toEqual(["2026_01_NE_SEA"]);

    const stealRank = await api("/weeks/1/picks", {
      method: "PUT",
      body: { picks: [{ gameId: "2026_01_CHI_CAR", team: "CHI", rank: 1 }] },
      player: corey.id,
      now: AFTER_OPENER,
    });
    expect(stealRank.status).toBe(409);
    expect(stealRank.body.error.code).toBe("RANK_FROZEN");

    // Omitting the frozen pick keeps it; unlocked picks are replaced.
    const edited = await api("/weeks/1/picks", {
      method: "PUT",
      body: { picks: [{ gameId: "2026_01_BUF_HOU", team: "HOU", rank: 2 }, { gameId: "2026_01_TB_CIN", team: "TB", rank: 3 }] },
      player: corey.id,
      now: AFTER_OPENER,
    });
    expect(edited.status).toBe(200);
    expect(edited.body.picks).toEqual([
      { gameId: "2026_01_NE_SEA", team: "SEA", rank: 1 },
      { gameId: "2026_01_BUF_HOU", team: "HOU", rank: 2 },
      { gameId: "2026_01_TB_CIN", team: "TB", rank: 3 },
    ]);

    // Alex can't add a pick on the started game.
    const late = await api("/weeks/1/picks", {
      method: "PUT",
      body: { picks: [{ gameId: "2026_01_NE_SEA", team: "NE", rank: 1 }] },
      player: alex.id,
      now: AFTER_OPENER,
    });
    expect(late.status).toBe(409);

    // Reveal: only the started game's pick is visible to others; tallies appear for it.
    const boardAfter = await api("/board/week/1", { player: alex.id, now: AFTER_OPENER });
    const coreyAfter = boardAfter.body.rows.find((r: any) => r.playerId === corey.id);
    expect(coreyAfter.picks.map((p: any) => p.gameId)).toEqual(["2026_01_NE_SEA"]);
    const week = await api("/weeks/1", { now: AFTER_OPENER });
    expect(week.body.pickCounts["2026_01_NE_SEA"].home).toBeGreaterThanOrEqual(1);
    expect(week.body.pickCounts["2026_01_BUF_HOU"]).toBeUndefined();

    // Corey always sees their own picks.
    const own = await api("/board/week/1", { player: corey.id, now: AFTER_OPENER });
    expect(own.body.rows.find((r: any) => r.playerId === corey.id).picks).toHaveLength(3);
  });

  it("rejects malformed picks", async () => {
    const p = await newPlayer("Bad");
    const cases: [unknown, string][] = [
      [[{ gameId: "2026_01_NE_SEA", team: "KC", rank: 1 }], "INVALID_TEAM"],
      [[{ gameId: "nope", team: "KC", rank: 1 }], "UNKNOWN_GAME"],
      [[{ gameId: "2026_01_NE_SEA", team: "SEA", rank: 1 }, { gameId: "2026_01_SF_LA", team: "SF", rank: 1 }], "DUPLICATE_RANK"],
      ["nope", "VALIDATION"],
    ];
    for (const [picks, code] of cases) {
      const { status, body } = await api("/weeks/1/picks", { method: "PUT", body: { picks }, player: p.id, now: BEFORE });
      expect(status).toBe(400);
      expect(body.error.code).toBe(code);
    }
  });
});

describe("admin", () => {
  const pin = "1234";

  it("guards with the PIN", async () => {
    expect((await api("/admin/verify", { method: "POST", body: {} })).status).toBe(401);
    expect((await api("/admin/verify", { method: "POST", body: {}, pin: "0000" })).status).toBe(401);
    expect((await api("/admin/verify", { method: "POST", body: {}, pin })).status).toBe(200);
    expect((await api("/admin/pull-results", { method: "POST", body: {} })).status).toBe(401);
    expect((await api("/admin/pull-results", { method: "POST", body: { week: 99 }, pin })).status).toBe(400);
  });

  it("records results that score the board, and keeps them through a schedule sync", async () => {
    const p = await newPlayer("Scorer");
    const week2 = (await api("/weeks/2", { now: BEFORE })).body.games as any[];
    const [g1, g2, g3] = week2;
    await api("/weeks/2/picks", {
      method: "PUT",
      body: {
        picks: [
          { gameId: g1.id, team: g1.away, rank: 1 },
          { gameId: g2.id, team: g2.away, rank: 2 },
          { gameId: g3.id, team: g3.away, rank: 5 },
        ],
      },
      player: p.id,
      now: BEFORE,
    });
    const outsider = ["KC", "SEA", "DAL"].find((t) => t !== g1.away && t !== g1.home)!;
    const bad = await api(`/admin/games/${g1.id}/result`, { method: "PUT", body: { winner: outsider }, pin });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("INVALID_WINNER");
    expect((await api("/admin/games/nope/result", { method: "PUT", body: { winner: null }, pin })).status).toBe(404);

    const set = await api(`/admin/games/${g1.id}/result`, { method: "PUT", body: { winner: g1.away, awayScore: 24, homeScore: 17 }, pin });
    expect(set.status).toBe(200);
    expect(set.body).toMatchObject({ winner: g1.away, awayScore: 24, homeScore: 17, status: "final" });
    await api(`/admin/games/${g2.id}/result`, { method: "PUT", body: { winner: g2.home }, pin });
    await api(`/admin/games/${g3.id}/result`, { method: "PUT", body: { winner: "TIE" }, pin });

    const done = "2026-09-23T12:00:00.000Z";
    const board = await api("/board/week/2", { player: p.id, now: done });
    const row = board.body.rows.find((r: any) => r.playerId === p.id);
    expect(row).toMatchObject({ points: 5, correct: 1, fives: 1, possible: 5, picksMade: 3 });
    expect(row.picks.map((x: any) => x.outcome)).toEqual(["win", "loss", "tie"]);
    expect(board.body.finalCount).toBe(3);

    const season = await api("/board/season", { player: p.id, now: done });
    const srow = season.body.rows.find((r: any) => r.playerId === p.id);
    expect(srow).toMatchObject({ points: 5, weeksPlayed: 1, bestWeek: { week: 2, points: 5 }, isMe: true });
    expect(srow.byWeek).toEqual({ 2: 5 });

    const sync = await api("/admin/sync-schedule", { method: "POST", body: {}, pin });
    expect(sync.body.upserted).toBe(272);
    const still = await api("/weeks/2", { now: done });
    expect(still.body.games.find((g: any) => g.id === g1.id).winner).toBe(g1.away);

    const cleared = await api(`/admin/games/${g3.id}/result`, { method: "PUT", body: { winner: null }, pin });
    expect(cleared.body.winner).toBeNull();

    const adminWeek = await api("/admin/weeks/2", { pin, now: BEFORE });
    const g = adminWeek.body.games.find((x: any) => x.id === g1.id);
    expect(g.picks).toContainEqual({ playerId: p.id, name: p.name, team: g1.away, rank: 1 });
  });

  it("backfills picks past locks, renames and deletes players", async () => {
    const p = await newPlayer("Late");
    const backfill = await api(`/admin/players/${p.id}/weeks/1/picks`, {
      method: "PUT",
      body: { picks: [{ gameId: "2026_01_NE_SEA", team: "NE", rank: 1 }] },
      pin,
      now: AFTER_WEEK1,
    });
    expect(backfill.status).toBe(200);
    expect(backfill.body.picks).toEqual([{ gameId: "2026_01_NE_SEA", team: "NE", rank: 1 }]);

    const players = await api("/admin/players", { pin });
    expect(players.body.players.find((x: any) => x.id === p.id)).toMatchObject({ picksCount: 1, weeksPlayed: 1 });

    const other = await newPlayer("Other");
    const clash = await api(`/admin/players/${p.id}`, { method: "PATCH", body: { name: other.name.toLowerCase() }, pin });
    expect(clash.status).toBe(409);
    const renamed = await api(`/admin/players/${p.id}`, { method: "PATCH", body: { name: `${p.name} Jr` }, pin });
    expect(renamed.body.player.name).toBe(`${p.name} Jr`);

    expect((await api(`/admin/players/${p.id}`, { method: "DELETE", pin })).status).toBe(200);
    expect((await api(`/admin/players/${p.id}`, { method: "DELETE", pin })).status).toBe(404);
    const boot = await api("/bootstrap", { player: p.id });
    expect(boot.body.me).toBeNull();
    const week = await api("/weeks/1", { now: AFTER_WEEK1 });
    expect(week.body.pickCounts["2026_01_NE_SEA"]).toBeDefined();
  });
});

describe("late joiner", () => {
  // Sunday evening: every Week 1 game has kicked off except Sunday night and Monday night.
  const SUNDAY_NIGHT = "2026-09-13T22:00:00.000Z";

  it("can still pick the remaining games and score them at full value", async () => {
    const p = await newPlayer("Latecomer");
    const week = (await api("/weeks/1", { now: SUNDAY_NIGHT })).body;
    const open = week.games.filter((g: any) => !g.locked);
    expect(open).toHaveLength(2); // SNF + MNF

    const picks = open.map((g: any, i: number) => ({ gameId: g.id, team: g.home, rank: i + 1 }));
    const saved = await api("/weeks/1/picks", { method: "PUT", body: { picks }, player: p.id, now: SUNDAY_NIGHT });
    expect(saved.status).toBe(200);
    expect(saved.body.picks).toEqual(picks);

    for (const g of open) {
      await api(`/admin/games/${g.id}/result`, { method: "PUT", body: { winner: g.home }, pin: "1234" });
    }
    const board = await api("/board/week/1", { player: p.id, now: "2026-09-16T12:00:00.000Z" });
    const row = board.body.rows.find((r: any) => r.playerId === p.id);
    // Rank 1 and rank 2, both correct: 5 + 4.
    expect(row).toMatchObject({ points: 9, correct: 2, fives: 1, picksMade: 2 });

    // Clean up so the shared week-1 fixtures stay result-free for other assertions.
    for (const g of open) {
      await api(`/admin/games/${g.id}/result`, { method: "PUT", body: { winner: null }, pin: "1234" });
    }
  });
});
