import { describe, expect, it } from "vitest";
import { buildWinnings, SEASON_POT, WEEKLY_POT } from "../../shared/winnings.ts";
import { mkGame } from "./helpers.ts";
import { SEASON_START_WEEK, WEEKS } from "../../shared/week.ts";
import type { PlayerPick } from "../../shared/scoring.ts";
import type { Game } from "../../shared/types.ts";

const players = [
  { id: "p1", name: "Corey" },
  { id: "p2", name: "Alex" },
  { id: "p3", name: "Sam" },
];
const now = "2026-12-01T12:00:00.000Z";

describe("weekly pots", () => {
  it("gives a lone winner the whole pot", () => {
    const games: Game[] = [mkGame("g1", 5, now, "KC", "DEN", "KC")];
    const picks: PlayerPick[] = [{ playerId: "p1", gameId: "g1", team: "KC", rank: 1 }];
    const board = buildWinnings({ season: 2026, players, picks, games, now });
    const corey = board.rows.find((r) => r.playerId === "p1")!;
    expect(corey).toMatchObject({ weekly: WEEKLY_POT, weeksWon: 1, total: WEEKLY_POT });
    expect(board.weeks).toEqual([{ week: 5, winnerIds: ["p1"], winnerNames: ["Corey"], share: WEEKLY_POT }]);
  });

  it("splits a tied week evenly, and only a winner gets a share", () => {
    const games: Game[] = [mkGame("g1", 5, now, "KC", "DEN", "KC")];
    const picks: PlayerPick[] = [
      { playerId: "p1", gameId: "g1", team: "KC", rank: 1 },
      { playerId: "p2", gameId: "g1", team: "KC", rank: 1 },
      { playerId: "p3", gameId: "g1", team: "DEN", rank: 1 }, // picked, but lost — not a winner
    ];
    const board = buildWinnings({ season: 2026, players, picks, games, now });
    const row = (id: string) => board.rows.find((r) => r.playerId === id)!;
    const corey = row("p1"),
      alex = row("p2"),
      sam = row("p3");
    expect(corey.weekly).toBe(9);
    expect(alex.weekly).toBe(9);
    expect(sam.weekly).toBe(0);
    expect(board.weeks[0]).toMatchObject({ week: 5, share: 9 });
    expect(new Set(board.weeks[0]!.winnerIds)).toEqual(new Set(["p1", "p2"]));
    // Tied on money, so tied on place too — the same "1, 1, 3" the point boards use.
    expect(corey.place).toBe(1);
    expect(alex.place).toBe(1);
    expect(sam.place).toBe(3);
  });

  it("splits three ways clean, to the cent", () => {
    const games: Game[] = [mkGame("g1", 5, now, "KC", "DEN", "KC")];
    const picks: PlayerPick[] = players.map((p) => ({ playerId: p.id, gameId: "g1", team: "KC", rank: 1 }));
    const board = buildWinnings({ season: 2026, players, picks, games, now });
    for (const row of board.rows) expect(row.weekly).toBe(6);
    expect(board.weeks[0]!.share).toBe(6);
  });

  it("settles a week nobody picked with no winner and no split", () => {
    const games: Game[] = [mkGame("g1", 5, now, "KC", "DEN", "KC")];
    const board = buildWinnings({ season: 2026, players, picks: [], games, now });
    expect(board.weeks).toEqual([]);
    for (const row of board.rows) expect(row.weekly).toBe(0);
  });

  it("does not settle a week with a game still pending", () => {
    const games: Game[] = [mkGame("g1", 5, now, "KC", "DEN", "KC"), mkGame("g2", 5, now, "SF", "LA", null)];
    const picks: PlayerPick[] = [{ playerId: "p1", gameId: "g1", team: "KC", rank: 1 }];
    const board = buildWinnings({ season: 2026, players, picks, games, now });
    expect(board.weeks).toEqual([]);
    expect(board.rows.find((r) => r.playerId === "p1")!.weekly).toBe(0);
  });

  it("pays out every week's own pot, not just the ones that count towards the season", () => {
    // Week 1 crowns its own winner same as any other — SEASON_START_WEEK only gates the season race.
    expect(SEASON_START_WEEK).toBeGreaterThan(1);
    const games: Game[] = [mkGame("g1", 1, now, "KC", "DEN", "KC")];
    const picks: PlayerPick[] = [{ playerId: "p1", gameId: "g1", team: "KC", rank: 1 }];
    const board = buildWinnings({ season: 2026, players, picks, games, now });
    expect(board.rows.find((r) => r.playerId === "p1")!.weekly).toBe(WEEKLY_POT);
  });
});

describe("the season pot", () => {
  it("waits for the season's last week, not the current leader", () => {
    const games: Game[] = [mkGame("g1", SEASON_START_WEEK, now, "KC", "DEN", "KC")];
    const picks: PlayerPick[] = [{ playerId: "p1", gameId: "g1", team: "KC", rank: 1 }];
    const board = buildWinnings({ season: 2026, players, picks, games, now });
    expect(board.seasonSettled).toBe(false);
    for (const row of board.rows) expect(row.season).toBe(0);
  });

  it("splits once the last week is fully final", () => {
    const games: Game[] = [mkGame("g1", WEEKS, now, "KC", "DEN", "KC")];
    const picks: PlayerPick[] = [
      { playerId: "p1", gameId: "g1", team: "KC", rank: 1 }, // wins: the season lead
      { playerId: "p2", gameId: "g1", team: "DEN", rank: 1 }, // loses
    ];
    const board = buildWinnings({ season: 2026, players, picks, games, now });
    expect(board.seasonSettled).toBe(true);
    const corey = board.rows.find((r) => r.playerId === "p1")!;
    expect(corey.season).toBe(SEASON_POT);
    expect(corey.total).toBe(corey.weekly + SEASON_POT);
    expect(board.rows.find((r) => r.playerId === "p2")!.season).toBe(0);
  });

  it("never hands the pot to a field that never played a counted week", () => {
    // The last week has a result, but nobody ever submitted a pick all season — every row ties at
    // zero, which without the weeksPlayed guard would read as first place for everyone.
    const games: Game[] = [mkGame("g1", WEEKS, now, "KC", "DEN", "KC")];
    const board = buildWinnings({ season: 2026, players, picks: [], games, now });
    expect(board.seasonSettled).toBe(true);
    for (const row of board.rows) expect(row.season).toBe(0);
  });
});

describe("the running total", () => {
  it("adds a player's weekly winnings to their season share", () => {
    const games: Game[] = [mkGame("g1", WEEKS - 1, now, "KC", "DEN", "KC"), mkGame("g2", WEEKS, now, "SF", "LA", "SF")];
    const picks: PlayerPick[] = [
      { playerId: "p1", gameId: "g1", team: "KC", rank: 1 },
      { playerId: "p1", gameId: "g2", team: "SF", rank: 1 },
    ];
    const board = buildWinnings({ season: 2026, players, picks, games, now });
    const corey = board.rows.find((r) => r.playerId === "p1")!;
    expect(corey.weeksWon).toBe(2);
    expect(corey.weekly).toBe(WEEKLY_POT * 2);
    expect(corey.season).toBe(SEASON_POT);
    expect(corey.total).toBe(WEEKLY_POT * 2 + SEASON_POT);
    expect(corey.place).toBe(1);
  });
});
