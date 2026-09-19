import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { uniqueName } from "./names.ts";

const BEFORE = "2026-09-09T12:00:00.000Z"; // Wed morning, nothing started
const AFTER_OPENER = "2026-09-10T03:00:00.000Z"; // NE @ SEA has kicked off, nothing else has
const AFTER_WEEK1 = "2026-09-16T12:00:00.000Z"; // week 1 done

interface Opts {
  /** Device token, as returned when the player was created or claimed. */
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
  if (opts.player) headers["x-player-token"] = opts.player;
  if (opts.pin) headers["x-admin-pin"] = opts.pin;
  const res = await SELF.fetch(url, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as T };
}

/** A player plus the token their first device holds; `id` stays for board assertions. */
async function newPlayer(prefix = "Player"): Promise<{ id: string; name: string; token: string; code: string }> {
  const name = uniqueName(prefix);
  const { status, body } = await api("/players", { body: { name } });
  expect(status).toBe(201);
  return { ...body.player, token: body.token, code: body.code };
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
    const name = uniqueName("Corey");
    const first = await api("/players", { body: { name } });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ created: true, player: { name } });
    const again = await api("/players", { body: { name: `  ${name.toUpperCase()}  ` } });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ created: false, player: { id: first.body.player.id, name } });
    const bad = await api("/players", { body: { name: "x" } });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("INVALID_NAME");
    // The id alone proves nothing; the token this device was handed does.
    const anon = await api("/bootstrap", { player: first.body.player.id });
    expect(anon.body.me).toBeNull();
    const boot = await api("/bootstrap", { player: first.body.token });
    expect(boot.body.me).toEqual(first.body.player);
    expect(boot.body.myCode).toBe(first.body.code);
    expect(boot.body.players.some((p: any) => p.id === first.body.player.id && p.claimed)).toBe(true);
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
    const saved = await api("/weeks/1/picks", { method: "PUT", body: { picks }, player: corey.token, now: BEFORE });
    expect(saved.status).toBe(200);
    expect(saved.body.picks).toEqual(picks);

    const mine = await api("/weeks/1", { player: corey.token, now: BEFORE });
    expect(mine.body.myPicks).toEqual(picks);
    expect(mine.body.submitted).toBeGreaterThanOrEqual(1);
    expect(mine.body.pickCounts).toEqual({}); // nothing kicked off -> no tallies

    // Alex can't see Corey's picks before kickoff, but sees that 5 were made.
    const boardBefore = await api("/board/week/1", { player: alex.token, now: BEFORE });
    const coreyRow = boardBefore.body.rows.find((r: any) => r.playerId === corey.id);
    expect(coreyRow).toMatchObject({ picksMade: 5, points: 0, possible: 15, picks: [] });

    // Replace freely before kickoff.
    const replaced = await api("/weeks/1/picks", {
      method: "PUT",
      body: { picks: [{ gameId: "2026_01_NE_SEA", team: "SEA", rank: 1 }, { gameId: "2026_01_CHI_CAR", team: "CHI", rank: 2 }] },
      player: corey.token,
      now: BEFORE,
    });
    expect(replaced.status).toBe(200);
    expect(replaced.body.picks).toHaveLength(2);

    // After the opener kicks off the SEA pick is frozen.
    const reRank = await api("/weeks/1/picks", {
      method: "PUT",
      body: { picks: [{ gameId: "2026_01_NE_SEA", team: "SEA", rank: 2 }, { gameId: "2026_01_CHI_CAR", team: "CHI", rank: 1 }] },
      player: corey.token,
      now: AFTER_OPENER,
    });
    expect(reRank.status).toBe(409);
    expect(reRank.body.error.code).toBe("GAME_LOCKED");
    expect(reRank.body.error.details.gameIds).toEqual(["2026_01_NE_SEA"]);

    const stealRank = await api("/weeks/1/picks", {
      method: "PUT",
      body: { picks: [{ gameId: "2026_01_CHI_CAR", team: "CHI", rank: 1 }] },
      player: corey.token,
      now: AFTER_OPENER,
    });
    expect(stealRank.status).toBe(409);
    expect(stealRank.body.error.code).toBe("RANK_FROZEN");

    // Omitting the frozen pick keeps it; unlocked picks are replaced.
    const edited = await api("/weeks/1/picks", {
      method: "PUT",
      body: { picks: [{ gameId: "2026_01_BUF_HOU", team: "HOU", rank: 2 }, { gameId: "2026_01_TB_CIN", team: "TB", rank: 3 }] },
      player: corey.token,
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
      player: alex.token,
      now: AFTER_OPENER,
    });
    expect(late.status).toBe(409);

    // Reveal: only the started game's pick is visible to others; tallies appear for it.
    const boardAfter = await api("/board/week/1", { player: alex.token, now: AFTER_OPENER });
    const coreyAfter = boardAfter.body.rows.find((r: any) => r.playerId === corey.id);
    expect(coreyAfter.picks.map((p: any) => p.gameId)).toEqual(["2026_01_NE_SEA"]);
    const week = await api("/weeks/1", { now: AFTER_OPENER });
    expect(week.body.pickCounts["2026_01_NE_SEA"].home).toBeGreaterThanOrEqual(1);
    expect(week.body.pickCounts["2026_01_BUF_HOU"]).toBeUndefined();

    // Corey always sees their own picks.
    const own = await api("/board/week/1", { player: corey.token, now: AFTER_OPENER });
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
      const { status, body } = await api("/weeks/1/picks", { method: "PUT", body: { picks }, player: p.token, now: BEFORE });
      expect(status).toBe(400);
      expect(body.error.code).toBe(code);
    }
  });
});

describe("the two offices", () => {
  const pin = "1234";

  it("keeps the league office and the commissioner's office apart", async () => {
    // Neither office opens for a stranger, and the owner PIN is still the break-glass for both.
    expect((await api("/league/pull-results", { method: "POST", body: {} })).status).toBe(401);
    expect((await api("/league/pull-results", { method: "POST", body: {}, pin: "0000" })).status).toBe(401);
    expect((await api("/league/pull-results", { method: "POST", body: { week: 99 }, pin })).status).toBe(400);
    expect((await api("/commissioner/players")).status).toBe(401);
    expect((await api("/commissioner/players", { pin })).status).toBe(200);
    // Results are not a commissioner's to set: the route simply is not there.
    expect((await api("/commissioner/pull-results", { method: "POST", body: {}, pin })).status).toBe(404);
  });

  it("hands both offices to the account that types the owner PIN, and only that account", async () => {
    const owner = await newPlayer("Owner");
    const bystander = await newPlayer("Bystander");

    const before = await api("/roles", { player: owner.token });
    expect(before.body.roles).toEqual({ commissioner: false, platformAdmin: false });

    expect((await api("/roles/claim", { body: {}, player: owner.token, pin: "0000" })).status).toBe(401);
    expect((await api("/roles/claim", { body: {}, pin })).status).toBe(401); // signed out
    const claimed = await api("/roles/claim", { body: {}, player: owner.token, pin });
    expect(claimed.status).toBe(200);
    expect(claimed.body.roles).toEqual({ commissioner: true, platformAdmin: true });

    // The keys travel with the account, not the phone: no PIN needed from here on.
    expect((await api("/commissioner/players", { player: owner.token })).status).toBe(200);
    expect((await api("/league/status", { player: owner.token })).status).toBe(200);
    expect((await api("/bootstrap", { player: owner.token })).body.roles).toEqual({ commissioner: true, platformAdmin: true });

    // And nobody else's.
    expect((await api("/commissioner/players", { player: bystander.token })).status).toBe(403);
    expect((await api("/league/status", { player: bystander.token })).status).toBe(403);
  });

  it("shares the office and takes it back, but never leaves the pool without one", async () => {
    const owner = await newPlayer("Sharer");
    const mate = await newPlayer("Deputy");
    await api("/roles/claim", { body: {}, player: owner.token, pin });

    const shared = await api("/commissioner/commissioners", { body: { playerId: mate.id }, player: owner.token });
    expect(shared.status).toBe(200);
    // Earlier tests in this file claim the office too, so assert membership rather than the whole list.
    const ids = shared.body.commissioners.map((c: any) => c.id);
    expect(ids).toContain(owner.id);
    expect(ids).toContain(mate.id);

    // Shared means shared: the roster, not the results.
    expect((await api("/commissioner/players", { player: mate.token })).status).toBe(200);
    expect((await api("/league/status", { player: mate.token })).status).toBe(403);

    const back = await api(`/commissioner/commissioners/${mate.id}`, { method: "DELETE", player: owner.token });
    expect(back.status).toBe(200);
    expect((await api("/commissioner/players", { player: mate.token })).status).toBe(403);

    // Down to the last one — earlier tests in this file have claimed the office too, so empty it
    // rather than assuming a count — and the pool refuses to be left with nobody running it.
    let holders = (await api("/commissioner", { player: owner.token })).body.commissioners as { id: string }[];
    while (holders.length > 1) {
      const victim = holders.find((h) => h.id !== owner.id)!;
      const gone = await api(`/commissioner/commissioners/${victim.id}`, { method: "DELETE", player: owner.token });
      expect(gone.status).toBe(200);
      holders = gone.body.commissioners;
    }
    expect((await api(`/commissioner/commissioners/${owner.id}`, { method: "DELETE", player: owner.token })).status).toBe(409);
  });

  it("lets the commissioner rename the pool, and shows the new name to everyone", async () => {
    const owner = await newPlayer("Renamer");
    await api("/roles/claim", { body: {}, player: owner.token, pin });
    const renamed = await api("/commissioner/pool", { method: "PATCH", body: { name: "Sunday Crew" }, player: owner.token });
    expect(renamed.status).toBe(200);
    expect((await api("/bootstrap")).body.poolName).toBe("Sunday Crew");
    expect((await api("/commissioner/pool", { method: "PATCH", body: { name: "x" }, player: owner.token })).status).toBe(400);
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
      player: p.token,
      now: BEFORE,
    });
    const outsider = ["KC", "SEA", "DAL"].find((t) => t !== g1.away && t !== g1.home)!;
    const bad = await api(`/league/games/${g1.id}/result`, { method: "PUT", body: { winner: outsider }, pin });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("INVALID_WINNER");
    expect((await api("/league/games/nope/result", { method: "PUT", body: { winner: null }, pin })).status).toBe(404);

    const set = await api(`/league/games/${g1.id}/result`, { method: "PUT", body: { winner: g1.away, awayScore: 24, homeScore: 17 }, pin });
    expect(set.status).toBe(200);
    expect(set.body).toMatchObject({ winner: g1.away, awayScore: 24, homeScore: 17, status: "final" });
    await api(`/league/games/${g2.id}/result`, { method: "PUT", body: { winner: g2.home }, pin });
    await api(`/league/games/${g3.id}/result`, { method: "PUT", body: { winner: "TIE" }, pin });

    const done = "2026-09-23T12:00:00.000Z";
    const board = await api("/board/week/2", { player: p.token, now: done });
    const row = board.body.rows.find((r: any) => r.playerId === p.id);
    expect(row).toMatchObject({ points: 5, correct: 1, fives: 1, possible: 5, picksMade: 3 });
    expect(row.picks.map((x: any) => x.outcome)).toEqual(["win", "loss", "tie"]);
    expect(board.body.finalCount).toBe(3);

    const season = await api("/board/season", { player: p.token, now: done });
    const srow = season.body.rows.find((r: any) => r.playerId === p.id);
    expect(srow).toMatchObject({ points: 5, weeksPlayed: 1, bestWeek: { week: 2, points: 5 }, isMe: true });
    expect(srow.byWeek).toEqual({ 2: 5 });

    const sync = await api("/league/sync-schedule", { method: "POST", body: {}, pin });
    expect(sync.body.upserted).toBe(272);
    const still = await api("/weeks/2", { now: done });
    expect(still.body.games.find((g: any) => g.id === g1.id).winner).toBe(g1.away);

    const cleared = await api(`/league/games/${g3.id}/result`, { method: "PUT", body: { winner: null }, pin });
    expect(cleared.body.winner).toBeNull();

    const adminWeek = await api("/commissioner/weeks/2", { pin, now: BEFORE });
    const g = adminWeek.body.games.find((x: any) => x.id === g1.id);
    expect(g.picks).toContainEqual({ playerId: p.id, name: p.name, team: g1.away, rank: 1 });
  });

  it("backfills picks past locks, renames and deletes players", async () => {
    const p = await newPlayer("Late");
    const backfill = await api(`/commissioner/players/${p.id}/weeks/1/picks`, {
      method: "PUT",
      body: { picks: [{ gameId: "2026_01_NE_SEA", team: "NE", rank: 1 }] },
      pin,
      now: AFTER_WEEK1,
    });
    expect(backfill.status).toBe(200);
    expect(backfill.body.picks).toEqual([{ gameId: "2026_01_NE_SEA", team: "NE", rank: 1 }]);

    const players = await api("/commissioner/players", { pin });
    expect(players.body.players.find((x: any) => x.id === p.id)).toMatchObject({ picksCount: 1, weeksPlayed: 1 });

    const other = await newPlayer("Other");
    const clash = await api(`/commissioner/players/${p.id}`, { method: "PATCH", body: { name: other.name.toLowerCase() }, pin });
    expect(clash.status).toBe(409);
    const renamed = await api(`/commissioner/players/${p.id}`, { method: "PATCH", body: { name: `${p.name} Jr` }, pin });
    expect(renamed.body.player.name).toBe(`${p.name} Jr`);

    expect((await api(`/commissioner/players/${p.id}`, { method: "DELETE", pin })).status).toBe(200);
    expect((await api(`/commissioner/players/${p.id}`, { method: "DELETE", pin })).status).toBe(404);
    const boot = await api("/bootstrap", { player: p.token });
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
    const saved = await api("/weeks/1/picks", { method: "PUT", body: { picks }, player: p.token, now: SUNDAY_NIGHT });
    expect(saved.status).toBe(200);
    expect(saved.body.picks).toEqual(picks);

    for (const g of open) {
      await api(`/league/games/${g.id}/result`, { method: "PUT", body: { winner: g.home }, pin: "1234" });
    }
    const board = await api("/board/week/1", { player: p.token, now: "2026-09-16T12:00:00.000Z" });
    const row = board.body.rows.find((r: any) => r.playerId === p.id);
    // Rank 1 and rank 2, both correct: 5 + 4.
    expect(row).toMatchObject({ points: 9, correct: 2, fives: 1, picksMade: 2 });

    // Clean up so the shared week-1 fixtures stay result-free for other assertions.
    for (const g of open) {
      await api(`/league/games/${g.id}/result`, { method: "PUT", body: { winner: null }, pin: "1234" });
    }
  });
});

describe("the join code", () => {
  /** The pool's own code, as bootstrap hands it to everyone in the pool. */
  async function joinCode(): Promise<string> {
    const { body } = await api("/bootstrap", { now: BEFORE });
    expect(body.pool?.joinCode, "bootstrap should carry the pool's join code").toBeTruthy();
    return body.pool.joinCode;
  }

  it("mints one for the pool that existed before codes did, and keeps it", async () => {
    const first = await joinCode();
    // Three letters then three digits, none of the characters people misread.
    expect(first).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ]{3}[23456789]{3}$/);
    // Minting happens once: the second look finds the same code, not a fresh one.
    expect(await joinCode()).toBe(first);
  });

  it("opens the pool it belongs to, however it was typed", async () => {
    const code = await joinCode();
    const dashed = `${code.slice(0, 3)}-${code.slice(3)}`;
    for (const typed of [code, code.toLowerCase(), dashed]) {
      const { status, body } = await api(`/join/${encodeURIComponent(typed)}`, { now: BEFORE });
      expect(status, typed).toBe(200);
      expect(body.pool.slug).toBe("high-five");
      expect(body.pool.joinCode).toBe(code);
      // Enough to open the pool, and nothing about who is in it.
      expect(body.pool.name).toBeTruthy();
      expect(Object.keys(body.pool).sort()).toEqual(["id", "joinCode", "name", "slug", "type"]);
    }
  });

  it("says no to a code no pool answers to", async () => {
    const code = await joinCode();
    // Shaped like a code, and not this pool's: the digits are rolled forward.
    const other = code.slice(0, 3) + [...code.slice(3)].map((d) => ((Number(d) % 8) + 2).toString()).join("");
    expect(other).not.toBe(code);
    const { status, body } = await api(`/join/${other}`, { now: BEFORE });
    expect(status).toBe(404);
    expect(body.error?.code ?? body.code).toBe("NO_SUCH_POOL");
  });

  it("turns away what is not a code at all, before it costs a lookup", async () => {
    // Too short, an excluded letter, digits and letters the wrong way round, and an eight
    // character device claim code — the near miss that shares the input box with it.
    for (const wrong of ["KDP47", "KIP472", "472KDP", "Q7MN4PK2"]) {
      const { status, body } = await api(`/join/${wrong}`, { now: BEFORE });
      expect(status, wrong).toBe(400);
      expect(body.error?.code ?? body.code).toBe("BAD_CODE");
    }
  });
});
