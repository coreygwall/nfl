import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { boardWeek, currentWeek, gameStatus, isLocked, nextKickoff, pickWeek, weekSummaries } from "../../shared/week.ts";
import type { Game } from "../../shared/types.ts";
import { mkGame, NOW, WEEK1, WEEK2 } from "./helpers.ts";

const all = [...WEEK1, ...WEEK2];

describe("locks and status", () => {
  it("locks at kickoff (inclusive)", () => {
    const g = mkGame("x", 1, "2026-09-13T17:00:00.000Z", "BUF", "HOU");
    expect(isLocked(g, "2026-09-13T16:59:59.999Z")).toBe(false);
    expect(isLocked(g, "2026-09-13T17:00:00.000Z")).toBe(true);
    expect(gameStatus(g, "2026-09-13T16:00:00.000Z")).toBe("upcoming");
    expect(gameStatus(g, "2026-09-13T18:00:00.000Z")).toBe("live");
    expect(gameStatus({ ...g, winner: "BUF" }, "2026-09-13T18:00:00.000Z")).toBe("final");
  });
});

describe("week selection", () => {
  it("picks the earliest week with an unstarted game", () => {
    expect(pickWeek(all, "2026-09-01T00:00:00.000Z")).toBe(1);
    expect(pickWeek(all, NOW)).toBe(1);
    expect(pickWeek(all, "2026-09-15T00:15:00.000Z")).toBe(2); // MNF kicked off -> week 2
    expect(pickWeek(all, "2026-10-01T00:00:00.000Z")).toBe(2); // nothing left; last week
  });
  it("boards the latest started week", () => {
    expect(boardWeek(all, "2026-09-01T00:00:00.000Z")).toBe(1);
    expect(boardWeek(all, NOW)).toBe(1);
    expect(boardWeek(all, "2026-09-18T01:00:00.000Z")).toBe(2);
  });
  it("keeps the current week through a 24h grace period after the last kickoff", () => {
    expect(currentWeek(all, "2026-09-15T13:00:00.000Z")).toBe(1); // Tuesday 9am ET
    expect(currentWeek(all, "2026-09-16T01:00:00.000Z")).toBe(2); // Tuesday 9pm ET
    expect(currentWeek(all, "2027-03-01T00:00:00.000Z")).toBe(18);
  });
  it("summarises weeks", () => {
    const s = weekSummaries(all, NOW);
    expect(s.map((w) => w.week)).toEqual([1, 2]);
    expect(s[0]).toMatchObject({ gameCount: 6, lockedCount: 2, finalCount: 0, firstKickoff: "2026-09-10T00:20:00.000Z", lastKickoff: "2026-09-15T00:15:00.000Z" });
    expect(nextKickoff(all, NOW)).toBe("2026-09-13T20:25:00.000Z");
    expect(nextKickoff(all, "2027-01-01T00:00:00.000Z")).toBeNull();
  });
});

describe("real 2026 schedule", () => {
  const data = JSON.parse(readFileSync(new URL("../../shared/schedule-2026.json", import.meta.url), "utf8")) as {
    games: { id: string; week: number; kickoff: string; away: string; home: string }[];
  };
  const games = data.games.map((g) => mkGame(g.id, g.week, g.kickoff, g.away as Game["away"], g.home as Game["home"]));
  it("has 272 games in 18 weeks with valid UTC kickoffs", () => {
    expect(games).toHaveLength(272);
    expect(new Set(games.map((g) => g.week)).size).toBe(18);
    for (const g of games) expect(new Date(g.kickoffAt).toISOString()).toBe(g.kickoffAt);
  });
  it("opens with NE @ SEA on Wed Sep 9 8:20pm ET", () => {
    const first = [...games].sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt))[0]!;
    expect(first.id).toBe("2026_01_NE_SEA");
    expect(first.kickoffAt).toBe("2026-09-10T00:20:00.000Z");
    expect(pickWeek(games, "2026-09-09T12:00:00.000Z")).toBe(1);
    expect(pickWeek(games, "2026-09-16T12:00:00.000Z")).toBe(2);
  });
});
