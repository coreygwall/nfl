import { describe, expect, it } from "vitest";
import { planNotifications } from "../../shared/notify-plan.ts";
import type { Abbr } from "../../shared/teams.ts";
import type { Game, Player } from "../../shared/types.ts";
import { mkGame } from "./helpers.ts";

/** Thursday night, an early Sunday slate, a late one, and Monday night. */
const WEEK: Game[] = [
  mkGame("thu", 5, "2026-10-09T00:15:00.000Z", "MIA", "NYJ"),
  mkGame("e1", 5, "2026-10-11T17:00:00.000Z", "BUF", "HOU"),
  mkGame("e2", 5, "2026-10-11T17:00:00.000Z", "NE", "CLE"),
  mkGame("l1", 5, "2026-10-11T20:05:00.000Z", "KC", "DEN"),
  mkGame("mnf", 5, "2026-10-13T00:15:00.000Z", "GB", "MIN"),
];

const players: Player[] = [
  { id: "p1", name: "Corey" },
  { id: "p2", name: "Sam" },
];

type P = { playerId: string; gameId: string; team: Abbr; rank: number; week: number };
const pick = (playerId: string, gameId: string, team: Abbr, rank: number): P => ({ playerId, gameId, team, rank, week: 5 });

/** Corey has a pick in every slate; Sam has nothing until Monday. */
const PICKS: P[] = [
  pick("p1", "thu", "MIA", 5),
  pick("p1", "e1", "BUF", 1),
  pick("p1", "e2", "NE", 3),
  pick("p1", "l1", "KC", 2),
  pick("p1", "mnf", "GB", 4),
  pick("p2", "mnf", "MIN", 1),
];

const won = (games: Game[], ids: Record<string, Abbr | "TIE">): Game[] =>
  games.map((g) => (ids[g.id] ? { ...g, winner: ids[g.id]! } : g));

const plan = (opts: { now: string; games?: Game[]; picks?: P[]; sent?: Set<string> }) =>
  planNotifications({
    season: 2026,
    now: opts.now,
    games: opts.games ?? WEEK,
    players,
    picks: opts.picks ?? PICKS,
    entryCountByPlayer: new Map(),
    slug: "high-five",
    alreadySent: opts.sent ?? new Set(),
  });

describe("nudges", () => {
  it("goes out about two hours before the week's first game, to whoever is short", () => {
    // Thursday kickoff is 00:15Z; two hours before is 22:15Z on the Wednesday.
    const out = plan({ now: "2026-10-08T22:20:00.000Z", picks: [pick("p1", "thu", "MIA", 5)] });
    expect(out.map((p) => p.id).sort()).toEqual([
      "2026:5:nudge:weekOpen:p1",
      "2026:5:nudge:weekOpen:p2",
    ]);
    expect(out[0]!.notification.kind).toBe("picksDue");
  });

  it("leaves alone anyone who has all five in", () => {
    const full: P[] = [1, 2, 3, 4, 5].map((rank, i) => pick("p1", ["thu", "e1", "e2", "l1", "mnf"][i]!, "MIA", rank));
    const out = plan({ now: "2026-10-08T22:20:00.000Z", picks: full });
    expect(out.map((p) => p.playerId)).toEqual(["p2"]);
  });

  it("says nothing a day out, or with minutes to go", () => {
    expect(plan({ now: "2026-10-07T22:20:00.000Z" })).toEqual([]);
    expect(plan({ now: "2026-10-09T00:05:00.000Z" }).filter((p) => p.notification.kind === "picksDue")).toEqual([]);
  });

  it("nudges again on Sunday morning, because Thursday's has been forgotten", () => {
    // The early slate kicks at 17:00Z; this is 15:10Z on the Sunday.
    const out = plan({ now: "2026-10-11T15:10:00.000Z", picks: [pick("p1", "thu", "MIA", 5)] });
    expect(out.filter((p) => p.notification.kind === "picksDue").map((p) => p.id).sort()).toEqual([
      "2026:5:nudge:sunday:p1",
      "2026:5:nudge:sunday:p2",
    ]);
  });

  it("does not send the Sunday nudge twice when Sunday is the week's first game", () => {
    const sundayOnly = WEEK.filter((g) => g.id === "e1" || g.id === "e2");
    const out = plan({ now: "2026-10-11T15:10:00.000Z", games: sundayOnly, picks: [] });
    expect(out.map((p) => p.id).sort()).toEqual(["2026:5:nudge:weekOpen:p1", "2026:5:nudge:weekOpen:p2"]);
  });
});

describe("a slate settling", () => {
  it("says nothing while one game in the slate is still going", () => {
    const games = won(WEEK, { thu: "MIA", e1: "BUF" });
    const out = plan({ now: "2026-10-11T20:00:00.000Z", games }).filter((p) => p.notification.kind === "segment");
    // Thursday is complete and is reported; the early slate still has e2 outstanding.
    expect(out.map((p) => p.id)).toEqual(["2026:5:thu:p1"]);
  });

  it("sends one message per entry with a pick in the slate, and none to anyone without", () => {
    const games = won(WEEK, { thu: "MIA", e1: "BUF", e2: "CLE" });
    const out = plan({ now: "2026-10-11T20:00:00.000Z", games }).filter((p) => p.id.includes("sunEarly"));
    // Sam had nothing in the early games, so Sam hears nothing.
    expect(out.map((p) => p.id)).toEqual(["2026:5:sunEarly:p1"]);
    expect(out[0]!.notification.body).toContain("the Bills won");
    expect(out[0]!.notification.body).toContain("still to play");
  });

  it("does not repeat a slate it has already reported", () => {
    const games = won(WEEK, { thu: "MIA" });
    const sent = new Set(["2026:5:thu:p1"]);
    expect(plan({ now: "2026-10-11T20:00:00.000Z", games, sent }).filter((p) => p.id.includes(":thu:"))).toEqual([]);
  });

  it("counts the running total across slates, not just the one that settled", () => {
    const games = won(WEEK, { thu: "MIA", e1: "BUF", e2: "CLE" });
    const out = plan({ now: "2026-10-11T20:00:00.000Z", games }).find((p) => p.id === "2026:5:sunEarly:p1")!;
    // MIA at rank 5 is 1, BUF at rank 1 is 5, NE at rank 3 lost. Six for the week.
    expect(out.notification.body).toContain("You are on 6 for Week 5.");
  });
});

describe("the end of the week", () => {
  const done = won(WEEK, { thu: "MIA", e1: "BUF", e2: "CLE", l1: "KC", mnf: "GB" });

  it("is the only thing said once the week is over", () => {
    // Not just instead of the last slate: instead of every slate still unreported. A run catching
    // up after an outage should be one message, not the whole week replayed into a lock screen.
    const out = plan({ now: "2026-10-13T04:00:00.000Z", games: done });
    expect(out.map((p) => p.notification.kind)).not.toContain("segment");
    expect(out.map((p) => p.id).sort()).toEqual(["2026:5:weekDone:p1", "2026:5:weekDone:p2"]);
  });

  it("gives each entry its place and its points", () => {
    const out = plan({ now: "2026-10-13T04:00:00.000Z", games: done });
    const corey = out.find((p) => p.playerId === "p1")!;
    // 1 + 5 + 2 (KC at rank 2 is 4 — MIA 1, BUF 5, KC 4, GB 2) = 12; NE lost.
    expect(corey.notification.title).toBe("You won Week 5");
    expect(corey.notification.body).toContain("12 points, 1st of 2.");
    const sam = out.find((p) => p.playerId === "p2")!;
    expect(sam.notification.title).toBe("2nd in Week 5");
  });

  it("still reports the earlier slates it has not reported yet", () => {
    const nearlyDone = won(WEEK, { thu: "MIA", e1: "BUF", e2: "CLE", l1: "KC" });
    const out = plan({ now: "2026-10-12T01:00:00.000Z", games: nearlyDone });
    expect(out.map((p) => p.id).sort()).toEqual(["2026:5:sunEarly:p1", "2026:5:sunLate:p1", "2026:5:thu:p1"]);
  });
});

describe("what it looks at", () => {
  it("ignores a week whose games are nowhere near now", () => {
    expect(plan({ now: "2026-11-20T00:00:00.000Z", games: won(WEEK, { thu: "MIA" }) })).toEqual([]);
  });

  it("points a result at the board and a nudge at the picks", () => {
    const nudge = plan({ now: "2026-10-08T22:20:00.000Z", picks: [] })[0]!;
    expect(nudge.notification.path).toBe("/p/high-five/week/5");
    const result = plan({ now: "2026-10-11T20:00:00.000Z", games: won(WEEK, { thu: "MIA" }) }).find((p) =>
      p.id.includes(":thu:"),
    )!;
    expect(result.notification.path).toBe("/p/high-five/board/week/5");
  });
});
