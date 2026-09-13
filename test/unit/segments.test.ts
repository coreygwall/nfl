import { describe, expect, it } from "vitest";
import { picksInSegment, segmentId, segmentOf, stillToPlay, weekSegments } from "../../shared/segments.ts";
import type { Game, Pick } from "../../shared/types.ts";
import { mkGame } from "./helpers.ts";

/**
 * A realistic week, in UTC. September is EDT (UTC-4), so 1:00pm ET is 17:00Z and Thursday night's
 * 8:15pm ET is Friday 00:15Z — which is exactly the trap a naive `getUTCDay()` falls into.
 */
const WEEK: Game[] = [
  mkGame("thu", 5, "2026-10-09T00:15:00.000Z", "MIA", "NYJ"), // Thu 8:15pm ET
  mkGame("london", 5, "2026-10-11T13:30:00.000Z", "JAX", "CHI"), // Sun 9:30am ET
  mkGame("early1", 5, "2026-10-11T17:00:00.000Z", "BUF", "HOU"), // Sun 1:00pm ET
  mkGame("early2", 5, "2026-10-11T17:00:00.000Z", "NE", "CLE"),
  mkGame("early3", 5, "2026-10-11T17:25:00.000Z", "TB", "ATL"),
  mkGame("late1", 5, "2026-10-11T20:05:00.000Z", "KC", "DEN"), // Sun 4:05pm ET
  mkGame("late2", 5, "2026-10-11T20:25:00.000Z", "LA", "SF"),
  mkGame("snf", 5, "2026-10-12T00:20:00.000Z", "DAL", "PHI"), // Sun 8:20pm ET
  mkGame("mnf", 5, "2026-10-13T00:15:00.000Z", "GB", "MIN"), // Mon 8:15pm ET
];

describe("segmentOf", () => {
  it("reads the slate in league time, not UTC", () => {
    // All four of these are a different UTC day from their Eastern one.
    expect(segmentOf("2026-10-09T00:15:00.000Z")).toBe("thu");
    expect(segmentOf("2026-10-12T00:20:00.000Z")).toBe("sunNight");
    expect(segmentOf("2026-10-13T00:15:00.000Z")).toBe("mon");
    expect(segmentOf("2026-10-11T17:00:00.000Z")).toBe("sunEarly");
  });

  it("splits Sunday at 3:00 and 6:30", () => {
    expect(segmentOf("2026-10-11T18:55:00.000Z")).toBe("sunEarly"); // 2:55pm ET
    expect(segmentOf("2026-10-11T19:00:00.000Z")).toBe("sunLate"); // 3:00pm ET
    expect(segmentOf("2026-10-11T22:29:00.000Z")).toBe("sunLate"); // 6:29pm ET
    expect(segmentOf("2026-10-11T22:30:00.000Z")).toBe("sunNight"); // 6:30pm ET
  });

  it("keeps a London morning game in the early window", () => {
    expect(segmentOf("2026-10-11T13:30:00.000Z")).toBe("sunEarly");
  });

  it("survives the November clock change", () => {
    // Standard time: 1:00pm ET is 18:00Z, and Monday night is 01:15Z Tuesday.
    expect(segmentOf("2026-11-15T18:00:00.000Z")).toBe("sunEarly");
    expect(segmentOf("2026-11-17T01:15:00.000Z")).toBe("mon");
  });

  it("gives a midweek oddity its own slate rather than distorting a named one", () => {
    expect(segmentOf("2026-12-23T22:00:00.000Z")).toBe("late"); // a Wednesday
  });
});

describe("weekSegments", () => {
  const segments = weekSegments(WEEK);

  it("returns the slates in the order they settle", () => {
    expect(segments.map((s) => s.key)).toEqual(["thu", "sunEarly", "sunLate", "sunNight", "mon"]);
  });

  it("names the Sunday slates off the busiest kickoff in each", () => {
    const by = Object.fromEntries(segments.map((s) => [s.key, s.label]));
    expect(by.sunEarly).toBe("the 1:00 games");
    expect(by.sunLate).toBe("the 4:05 games");
    expect(by.thu).toBe("Thursday night");
    expect(by.mon).toBe("Monday night");
  });

  it("puts the London game in the early slate without renaming it", () => {
    const early = segments.find((s) => s.key === "sunEarly")!;
    expect(early.games.map((g) => g.id)).toEqual(["london", "early1", "early2", "early3"]);
    expect(early.firstKickoff).toBe("2026-10-11T13:30:00.000Z");
  });

  it("is settled only once every game in the slate has a result", () => {
    const partly = WEEK.map((g) => (g.id === "early1" || g.id === "early2" ? { ...g, winner: "BUF" as const } : g));
    const early = weekSegments(partly).find((s) => s.key === "sunEarly")!;
    expect(early.settled).toBe(false);
    const all = partly.map((g) => (g.week === 5 ? { ...g, winner: "BUF" as const } : g));
    expect(weekSegments(all).find((s) => s.key === "sunEarly")!.settled).toBe(true);
  });

  it("drops slates nobody plays in", () => {
    expect(segments.map((s) => s.key)).not.toContain("sat");
  });
});

describe("an entry's stake in a slate", () => {
  const picks: Pick[] = [
    { gameId: "early1", team: "BUF", rank: 1 },
    { gameId: "late1", team: "KC", rank: 2 },
    { gameId: "mnf", team: "GB", rank: 3 },
  ];

  it("finds the picks riding on each slate", () => {
    const segments = weekSegments(WEEK);
    const early = picksInSegment(picks, segments.find((s) => s.key === "sunEarly")!);
    expect(early.map((p) => p.gameId)).toEqual(["early1"]);
    const thursday = picksInSegment(picks, segments.find((s) => s.key === "thu")!);
    expect(thursday).toEqual([]);
  });

  it("counts what is still to come and what it is worth", () => {
    const played = WEEK.map((g) => (g.id === "early1" ? { ...g, winner: "BUF" as const } : g));
    // KC at rank 2 is worth 4, GB at rank 3 is worth 3.
    expect(stillToPlay(picks, played)).toEqual({ games: 2, points: 7 });
  });

  it("counts nothing once the week is done", () => {
    const done = WEEK.map((g) => ({ ...g, winner: "BUF" as const }));
    expect(stillToPlay(picks, done)).toEqual({ games: 0, points: 0 });
  });
});

describe("segmentId", () => {
  it("is stable per season, week and slate", () => {
    expect(segmentId(2026, 5, "sunEarly")).toBe("2026:5:sunEarly");
  });
});
