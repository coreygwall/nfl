import { describe, expect, it } from "vitest";
import { validatePicks } from "../../shared/picks.ts";
import { NOW, WEEK1 } from "./helpers.ts";

const fresh = [
  { gameId: "g3", team: "KC", rank: 1 },
  { gameId: "g4", team: "PHI", rank: 2 },
  { gameId: "g5", team: "GB", rank: 3 },
  { gameId: "g6", team: "SF", rank: 4 },
];

const run = (submitted: unknown, existing: { gameId: string; team: any; rank: number }[] = [], now = NOW, ignoreLocks = false) =>
  validatePicks({ submitted, games: WEEK1, existing, now, ignoreLocks });

describe("validatePicks", () => {
  it("accepts a fresh valid set", () => {
    const r = run(fresh);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.toWrite).toHaveLength(4);
    expect(r.final.map((p) => p.rank)).toEqual([1, 2, 3, 4]);
    expect(r.frozen).toEqual([]);
  });

  it.each([
    [[...fresh, { gameId: "g3", team: "DEN", rank: 5 }], "DUPLICATE_GAME"],
    [[...fresh, { gameId: "g6", team: "LA", rank: 1 }], "DUPLICATE_GAME"],
    [[fresh[0], { ...fresh[1], rank: 1 }], "DUPLICATE_RANK"],
    [[{ gameId: "nope", team: "KC", rank: 1 }], "UNKNOWN_GAME"],
    [[{ gameId: "g3", team: "SEA", rank: 1 }], "INVALID_TEAM"],
    [[{ gameId: "g3", team: "KC", rank: 0 }], "VALIDATION"],
    [[{ gameId: "g3", team: "KC", rank: 6 }], "VALIDATION"],
    [[{ gameId: "g3", team: "KC", rank: 1.5 }], "VALIDATION"],
    [[{ gameId: "g3", team: 7, rank: 1 }], "VALIDATION"],
    [["nope"], "VALIDATION"],
    ["not an array", "VALIDATION"],
    [[...fresh, { gameId: "g1", team: "NE", rank: 5 }, { gameId: "g2", team: "BUF", rank: 5 }], "TOO_MANY"],
  ])("rejects %j with %s", (submitted, code) => {
    const r = run(submitted as unknown);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe(code);
    expect(r.error.status).toBe(400);
  });

  it("rejects a new pick on a game that already kicked off", () => {
    const r = run([{ gameId: "g2", team: "BUF", rank: 1 }]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("GAME_LOCKED");
    expect(r.error.status).toBe(409);
    expect(r.error.details).toMatchObject({ gameIds: ["g2"], kickoffs: { g2: "2026-09-13T17:00:00.000Z" } });
  });

  it("treats kickoff exactly at now as locked", () => {
    const r = run([{ gameId: "g2", team: "BUF", rank: 1 }], [], "2026-09-13T17:00:00.000Z");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("GAME_LOCKED");
  });

  it("accepts an exact echo of a frozen pick and does not rewrite it", () => {
    const existing = [{ gameId: "g1", team: "SEA", rank: 2 }];
    const r = run([{ gameId: "g1", team: "SEA", rank: 2 }, ...fresh.filter((p) => p.rank !== 2)], existing);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.frozen).toEqual(existing);
    expect(r.toWrite.map((p) => p.gameId)).toEqual(["g3", "g5", "g6"]);
    expect(r.final).toHaveLength(4);
    expect(r.final.find((p) => p.gameId === "g1")).toEqual(existing[0]);
  });

  it("rejects re-ranking or re-teaming a frozen pick", () => {
    const existing = [{ gameId: "g1", team: "SEA", rank: 2 }];
    const reRanked = run([{ gameId: "g1", team: "SEA", rank: 1 }], existing);
    const reTeamed = run([{ gameId: "g1", team: "NE", rank: 2 }], existing);
    for (const r of [reRanked, reTeamed]) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("GAME_LOCKED");
    }
  });

  it("retains omitted frozen picks and replaces omitted unlocked picks", () => {
    const existing = [
      { gameId: "g1", team: "SEA", rank: 1 },
      { gameId: "g4", team: "DAL", rank: 2 },
    ];
    const r = run([{ gameId: "g5", team: "GB", rank: 3 }], existing);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.final).toEqual([
      { gameId: "g1", team: "SEA", rank: 1 },
      { gameId: "g5", team: "GB", rank: 3 },
    ]);
  });

  it("rejects an unlocked pick that reuses a frozen rank", () => {
    const existing = [{ gameId: "g1", team: "SEA", rank: 1 }];
    const r = run([{ gameId: "g5", team: "GB", rank: 1 }], existing);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("RANK_FROZEN");
      expect(r.error.details).toEqual({ ranks: [1] });
    }
  });

  it("clears all unlocked picks with an empty array but keeps frozen ones", () => {
    const existing = [
      { gameId: "g2", team: "HOU", rank: 5 },
      { gameId: "g6", team: "SF", rank: 1 },
    ];
    const r = run([], existing);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.toWrite).toEqual([]);
    expect(r.final).toEqual([{ gameId: "g2", team: "HOU", rank: 5 }]);
  });

  it("ignores locks when asked (admin backfill)", () => {
    const r = run([{ gameId: "g1", team: "NE", rank: 1 }], [{ gameId: "g1", team: "SEA", rank: 3 }], NOW, true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.frozen).toEqual([]);
    expect(r.final).toEqual([{ gameId: "g1", team: "NE", rank: 1 }]);
  });

  it("caps the merged set at five", () => {
    const existing = [
      { gameId: "g1", team: "SEA", rank: 4 },
      { gameId: "g2", team: "BUF", rank: 5 },
    ];
    const r = run(fresh, existing); // fresh uses ranks 1-4; rank 4 clashes with a frozen rank
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("RANK_FROZEN");
  });
});
