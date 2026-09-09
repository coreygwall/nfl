import { describe, expect, it } from "vitest";
import {
  assignPlaces,
  buildSeasonBoard,
  buildWeekBoard,
  compareRows,
  MAX_WEEK_POINTS,
  pointsForRank,
  scorePick,
} from "../../shared/scoring.ts";
import { mkGame, NOW, WEEK1, WEEK2 } from "./helpers.ts";

const players = [
  { id: "p1", name: "Corey" },
  { id: "p2", name: "Alex" },
  { id: "p3", name: "sam" },
];

describe("points", () => {
  it("maps rank to points", () => {
    expect([1, 2, 3, 4, 5].map(pointsForRank)).toEqual([5, 4, 3, 2, 1]);
    expect(MAX_WEEK_POINTS).toBe(15);
  });
  it("scores outcomes", () => {
    const pick = { gameId: "g", team: "KC" as const, rank: 2 };
    expect(scorePick(pick, mkGame("g", 1, NOW, "KC", "DEN", "KC"))).toEqual({ outcome: "win", points: 4 });
    expect(scorePick(pick, mkGame("g", 1, NOW, "KC", "DEN", "DEN"))).toEqual({ outcome: "loss", points: 0 });
    expect(scorePick(pick, mkGame("g", 1, NOW, "KC", "DEN", "TIE"))).toEqual({ outcome: "tie", points: 0 });
    expect(scorePick(pick, mkGame("g", 1, NOW, "KC", "DEN", null))).toEqual({ outcome: "pending", points: 0 });
  });
});

describe("buildWeekBoard", () => {
  const games = WEEK1.map((g) => ({ ...g }));
  // results: g1 SEA, g2 BUF, g3 KC, g4 pending, g5 pending, g6 pending
  games[0]!.winner = "SEA";
  games[1]!.winner = "BUF";
  games[2]!.winner = "KC";
  const picks = [
    // Corey: ranks 1,2 win, 3 loses, 4 pending, 5 wins -> 5 + 4 + 1 = 10
    { playerId: "p1", gameId: "g1", team: "SEA" as const, rank: 1 },
    { playerId: "p1", gameId: "g2", team: "BUF" as const, rank: 2 },
    { playerId: "p1", gameId: "g3", team: "DEN" as const, rank: 3 },
    { playerId: "p1", gameId: "g5", team: "GB" as const, rank: 4 },
    { playerId: "p1", gameId: "g6", team: "SF" as const, rank: 5 },
    // Alex: one win at rank 3, one pending at rank 1
    { playerId: "p2", gameId: "g3", team: "KC" as const, rank: 3 },
    { playerId: "p2", gameId: "g4", team: "PHI" as const, rank: 1 },
  ];
  const later = "2026-09-16T12:00:00.000Z";

  it("scores the example from the rules (5 + 4 + 1 = 10)", () => {
    const later2 = later; // everything kicked off
    const g = games.map((x) => (x.id === "g6" ? { ...x, winner: "SF" as const } : x));
    const board = buildWeekBoard({ week: 1, players, picks, games: g, now: later2 });
    const corey = board.rows.find((r) => r.name === "Corey")!;
    expect(corey.points).toBe(10);
    expect(corey.correct).toBe(3);
    expect(corey.fives).toBe(1);
    expect(corey.picksMade).toBe(5);
    expect(corey.possible).toBe(10 + 2); // g5 still pending at rank 4
  });

  it("hides other players' picks until kickoff but always shows your own", () => {
    const board = buildWeekBoard({ week: 1, players, picks, games, now: NOW, requesterId: "p2" });
    const corey = board.rows.find((r) => r.name === "Corey")!;
    const alex = board.rows.find((r) => r.name === "Alex")!;
    expect(corey.picksMade).toBe(5);
    expect(corey.picks.map((p) => p.gameId)).toEqual(["g1", "g2"]); // only started games revealed
    expect(alex.isMe).toBe(true);
    expect(alex.picks.map((p) => p.gameId)).toEqual(["g4", "g3"]); // own picks incl. unstarted, rank order
    expect(board.lockedCount).toBe(2);
    expect(board.finalCount).toBe(3);
    expect(board.gameCount).toBe(6);
  });

  it("orders rows by points, correct, fives, then name and assigns shared places", () => {
    const rows = assignPlaces([
      { name: "b", points: 10, correct: 2, fives: 1, place: 0 },
      { name: "a", points: 10, correct: 2, fives: 1, place: 0 },
      { name: "c", points: 10, correct: 3, fives: 0, place: 0 },
      { name: "d", points: 12, correct: 1, fives: 0, place: 0 },
      { name: "e", points: 10, correct: 2, fives: 0, place: 0 },
    ]);
    expect(rows.map((r) => [r.name, r.place])).toEqual([
      ["d", 1],
      ["c", 2],
      ["a", 3],
      ["b", 3],
      ["e", 5],
    ]);
    expect(compareRows({ name: "x", points: 1, correct: 0, fives: 0 }, { name: "y", points: 0, correct: 9, fives: 9 })).toBeLessThan(0);
  });

  it("gives players with no picks a zero row", () => {
    const board = buildWeekBoard({ week: 1, players, picks, games, now: NOW });
    const sam = board.rows.find((r) => r.name === "sam")!;
    expect(sam).toMatchObject({ points: 0, picksMade: 0, possible: 0, picks: [] });
    expect(sam.place).toBe(3);
  });
});

describe("buildSeasonBoard", () => {
  it("sums weeks and tracks best week and weeks played", () => {
    const games = [...WEEK1, ...WEEK2].map((g) => ({ ...g }));
    games.find((g) => g.id === "g1")!.winner = "SEA";
    games.find((g) => g.id === "h1")!.winner = "MIA";
    games.find((g) => g.id === "h2")!.winner = "DET";
    const picks = [
      { playerId: "p1", gameId: "g1", team: "SEA" as const, rank: 1 },
      { playerId: "p1", gameId: "h1", team: "MIA" as const, rank: 2 },
      { playerId: "p1", gameId: "h2", team: "CHI" as const, rank: 1 },
      { playerId: "p2", gameId: "h2", team: "DET" as const, rank: 1 },
    ];
    const board = buildSeasonBoard({ season: 2026, players, picks, games, now: "2026-09-21T12:00:00.000Z", requesterId: "p1" });
    const corey = board.rows.find((r) => r.name === "Corey")!;
    expect(corey).toMatchObject({ points: 9, correct: 2, fives: 1, weeksPlayed: 2, bestWeek: { week: 1, points: 5 }, isMe: true, place: 1 });
    expect(corey.byWeek).toEqual({ 1: 5, 2: 4 });
    expect(board.rows.find((r) => r.name === "Alex")).toMatchObject({ points: 5, weeksPlayed: 1, place: 2 });
    expect(board.rows.find((r) => r.name === "sam")).toMatchObject({ points: 0, weeksPlayed: 0, bestWeek: null, place: 3 });
    expect(board.throughWeek).toBe(2);
  });
});
