import { describe, expect, it } from "vitest";
import {
  awardContest,
  contestFor,
  contestResults,
  entryFor,
  finishHole,
  holeLabel,
  holedBy,
  initialsFor,
  isComplete,
  lastFinished,
  mergeCards,
  newStroke,
  nextUnfinishedHole,
  parseCard,
  pointsBoard,
  pointsLine,
  recordStroke,
  reassignStroke,
  removeStroke,
  setPar,
  standardPoints,
  STANDARD_PARS,
  strokesTaken,
  tallyRows,
  throughHole,
  toPar,
  toParText,
  undoHole,
  winnerOf,
  winningsLine,
  type PointValues,
  type ScrambleCard,
} from "../../shared/golf.ts";

/**
 * The web's copy of the scramble rules, held to the same cases the Swift is.
 *
 * `ScrambleTests.swift` is the original and these mirror its names deliberately: the two
 * implementations are read side by side when one of them changes, and a case that exists in one
 * language and not the other is exactly the gap that lets a shared card disagree with itself.
 */
const CREATED = "2026-09-19T12:00:00.000Z";
let clock = 0;
/** A monotonic `now`, so "which write was later" is a fact rather than a race. */
const tick = () => new Date(Date.parse(CREATED) + (clock += 1000)).toISOString();

function card(pars: number[] = Array(18).fill(4), points: PointValues = standardPoints()): ScrambleCard {
  return {
    id: "card",
    name: "Saturday",
    course: "",
    createdAt: CREATED,
    settingsUpdatedAt: CREATED,
    players: [
      { id: "c", name: "Corey" },
      { id: "d", name: "Dan" },
      { id: "p", name: "Pete" },
      { id: "s", name: "Sam" },
    ],
    pars,
    holes: [],
    contests: { longestDrive: false, closestToPin: false },
    points,
  };
}

/** A card with the contests on and pars that host both: 3s at 2 and 5, 5s at 4 and 6. */
function four(points: PointValues = standardPoints()): ScrambleCard {
  return {
    ...card([4, 3, 5, 4, 3, 5], points),
    contests: { longestDrive: true, closestToPin: true },
  };
}

const shot = (card: ScrambleCard, hole: number, playerId: string) =>
  recordStroke(card, hole, newStroke("shot", playerId, `${hole}-${playerId}-${clock}`), tick());

describe("the score is the count", () => {
  it("every stroke counts on the card whoever it belonged to", () => {
    let c = card();
    c = shot(c, 1, "c");
    c = recordStroke(c, 1, newStroke("penalty", null, "pen"), tick());
    c = shot(c, 1, "d");
    c = shot(c, 1, "p");
    c = finishHole(c, 1, true, tick());

    expect(entryFor(c, 1)?.strokes.length).toBe(5);
    expect(toPar(c)).toBe(1);
    expect(throughHole(c)).toBe(1);
    expect(holeLabel(5, 4)).toBe("bogey");
  });

  it("an open hole is not yet under par", () => {
    let c = card();
    c = shot(c, 1, "c");
    c = shot(c, 1, "d");
    expect(toPar(c)).toBe(0);
    expect(throughHole(c)).toBe(0);
    expect(strokesTaken(c)).toBe(0);
  });
});

describe("who gets the mark", () => {
  it("the tap-in counts and credits nobody", () => {
    let c = card();
    c = shot(c, 1, "c");
    c = shot(c, 1, "d");
    c = shot(c, 1, "p");
    c = finishHole(c, 1, true, tick());

    const rows = tallyRows(c);
    expect(entryFor(c, 1)?.strokes.length).toBe(4);
    expect(holedBy(entryFor(c, 1)!)).toBeNull();
    expect(rows.reduce((n, r) => n + r.kept, 0)).toBe(3);
    expect(rows.find((r) => r.player.id === "p")?.between).toBe(1);
  });

  it("holed it credits the last shot", () => {
    let c = card();
    c = shot(c, 1, "c");
    c = shot(c, 1, "d");
    c = shot(c, 1, "p");
    c = finishHole(c, 1, false, tick());

    expect(holedBy(entryFor(c, 1)!)).toBe("p");
    const pete = tallyRows(c).find((r) => r.player.id === "p");
    expect(pete?.holed).toBe(1);
    expect(pete?.between).toBe(0);
    expect(holeLabel(3, 4)).toBe("birdie");
  });

  it("a hole nobody hit on cannot be finished", () => {
    const c = finishHole(card(), 1, true, tick());
    expect(entryFor(c, 1)).toBeUndefined();
  });

  it("a finished hole ignores a stray tap", () => {
    let c = card();
    c = shot(c, 1, "c");
    c = finishHole(c, 1, false, tick());
    c = shot(c, 1, "d");
    expect(entryFor(c, 1)?.strokes.length).toBe(1);
  });

  it("undo reverses whatever the last act was", () => {
    let c = card();
    c = shot(c, 1, "c");
    c = shot(c, 1, "d");
    c = finishHole(c, 1, true, tick());
    expect(entryFor(c, 1)?.strokes.length).toBe(3);

    c = undoHole(c, 1, tick());
    expect(entryFor(c, 1)?.strokes.length).toBe(2);
    expect(entryFor(c, 1)?.finished).toBe(false);

    c = finishHole(c, 1, false, tick());
    c = undoHole(c, 1, tick());
    expect(entryFor(c, 1)?.strokes.length).toBe(2);
    expect(entryFor(c, 1)?.finished).toBe(false);

    c = undoHole(c, 1, tick());
    c = undoHole(c, 1, tick());
    c = undoHole(c, 1, tick());
    expect(entryFor(c, 1)?.strokes.length).toBe(0);
  });
});

describe("fixing a stroke after the fact", () => {
  it("a stroke can change hands on a finished hole", () => {
    let c = card();
    c = shot(c, 1, "c");
    c = shot(c, 1, "d");
    c = shot(c, 1, "p");
    c = finishHole(c, 1, true, tick());
    const third = entryFor(c, 1)!.strokes[2]!;

    c = reassignStroke(c, 1, third.id, "shot", "d", tick());

    expect(entryFor(c, 1)?.strokes.length).toBe(4);
    expect(entryFor(c, 1)?.finished).toBe(true);
    expect(entryFor(c, 1)?.strokes[2]!.playerId).toBe("d");
    expect(entryFor(c, 1)?.strokes[2]!.id).toBe(third.id);
    expect(tallyRows(c).find((r) => r.player.id === "d")?.kept).toBe(2);
    expect(tallyRows(c).find((r) => r.player.id === "p")?.kept).toBe(0);
  });

  it("the holed shot changes hands with the stroke", () => {
    let c = card();
    c = shot(c, 1, "c");
    c = shot(c, 1, "p");
    c = finishHole(c, 1, false, tick());
    expect(holedBy(entryFor(c, 1)!)).toBe("p");

    const last = entryFor(c, 1)!.strokes[1]!;
    c = reassignStroke(c, 1, last.id, "shot", "s", tick());
    expect(holedBy(entryFor(c, 1)!)).toBe("s");
  });

  it("a stroke cannot be given to a name that is not on the card", () => {
    let c = card();
    c = shot(c, 1, "c");
    const only = entryFor(c, 1)!.strokes[0]!;
    c = reassignStroke(c, 1, only.id, "shot", "nobody", tick());
    c = reassignStroke(c, 1, "not-a-stroke", "shot", "d", tick());
    expect(entryFor(c, 1)?.strokes[0]!.playerId).toBe("c");
  });

  it("a stroke in the middle comes off an open hole and not a finished one", () => {
    let c = card();
    c = shot(c, 1, "c");
    c = shot(c, 1, "d");
    c = shot(c, 1, "p");
    const middle = entryFor(c, 1)!.strokes[1]!;

    c = removeStroke(c, 1, middle.id, tick());
    expect(entryFor(c, 1)?.strokes.map((s) => s.playerId)).toEqual(["c", "p"]);

    c = finishHole(c, 1, false, tick());
    c = removeStroke(c, 1, entryFor(c, 1)!.strokes[0]!.id, tick());
    expect(entryFor(c, 1)?.strokes.length).toBe(2);
  });
});

describe("moving round the course", () => {
  it("advance skips finished holes and wraps to one that was missed", () => {
    let c = card(Array(9).fill(4));
    c = shot(c, 2, "c");
    c = finishHole(c, 2, false, tick());
    expect(nextUnfinishedHole(c, 1)).toBe(3);
    expect(nextUnfinishedHole(c, 9)).toBe(1);
  });

  it("the last finished hole is the last one finished rather than the highest numbered", () => {
    let c = card();
    c = shot(c, 5, "c");
    c = finishHole(c, 5, false, tick());
    c = shot(c, 3, "d");
    c = finishHole(c, 3, false, tick());
    expect(lastFinished(c)?.hole).toBe(3);
  });

  it("there is no last finished hole before anything is in", () => {
    expect(lastFinished(card())).toBeNull();
  });

  it("to par reads like a golfer", () => {
    expect(toParText(0)).toBe("E");
    expect(toParText(-2)).toBe("−2");
    expect(toParText(3)).toBe("+3");
  });

  it("correcting par changes the score it is measured against", () => {
    let c = card();
    c = shot(c, 1, "c");
    c = shot(c, 1, "d");
    c = shot(c, 1, "p");
    c = finishHole(c, 1, false, tick());
    expect(toPar(c)).toBe(-1);
    c = setPar(c, 1, 3, tick());
    expect(toPar(c)).toBe(0);
  });

  it("par stays inside the range a golf course uses", () => {
    let c = setPar(card(), 1, 9, tick());
    expect(c.pars[0]).toBe(6);
    c = setPar(c, 1, 1, tick());
    expect(c.pars[0]).toBe(3);
  });

  it("initials grow only where two names collide", () => {
    const out = initialsFor([
      { id: "c", name: "Corey" },
      { id: "d", name: "Dan" },
      { id: "p", name: "Pete" },
      { id: "s", name: "Sam" },
    ]);
    expect(out).toEqual({ c: "C", d: "D", p: "P", s: "S" });
    const clash = initialsFor([
      { id: "c", name: "Corey" },
      { id: "x", name: "Casey" },
    ]);
    expect(clash).toEqual({ c: "CO", x: "CA" });
  });
});

describe("the contests beside the round", () => {
  it("par decides which contest a hole hosts", () => {
    const c = four();
    expect(contestFor(c, 1)).toBeNull();
    expect(contestFor(c, 2)).toBe("closestToPin");
    expect(contestFor(c, 3)).toBe("longestDrive");
  });

  it("a card with the contests off hosts nothing anywhere", () => {
    const c = card([4, 3, 5, 4, 3, 5]);
    expect(contestResults(c)).toEqual([]);
  });

  it("correcting a par from the tee moves the contest with it", () => {
    let c = four();
    expect(contestFor(c, 1)).toBeNull();
    c = setPar(c, 1, 3, tick());
    expect(contestFor(c, 1)).toBe("closestToPin");
  });

  it("a par correction orphans an award without destroying it", () => {
    let c = four();
    c = awardContest(c, "longestDrive", 3, "d", tick());
    expect(winnerOf(c, "longestDrive", 3)?.id).toBe("d");

    c = setPar(c, 3, 4, tick());
    expect(winnerOf(c, "longestDrive", 3)).toBeNull();
    expect(winnerOf(c, "closestToPin", 3)).toBeNull();
    expect(entryFor(c, 3)?.awards[0]!.playerId).toBe("d");

    c = setPar(c, 3, 5, tick());
    expect(winnerOf(c, "longestDrive", 3)?.id).toBe("d");
  });

  it("an award names the winner and tapping the same name takes it back", () => {
    let c = four();
    c = awardContest(c, "closestToPin", 2, "c", tick());
    expect(winnerOf(c, "closestToPin", 2)?.id).toBe("c");
    c = awardContest(c, "closestToPin", 2, null, tick());
    expect(winnerOf(c, "closestToPin", 2)).toBeNull();
  });

  it("a name that is not on the card cannot be given anything", () => {
    const c = awardContest(four(), "closestToPin", 2, "nobody", tick());
    expect(entryFor(c, 2)).toBeUndefined();
  });

  it("a finished hole can still be awarded", () => {
    let c = four();
    c = shot(c, 2, "c");
    c = shot(c, 2, "d");
    c = finishHole(c, 2, true, tick());
    c = awardContest(c, "closestToPin", 2, "c", tick());
    expect(winnerOf(c, "closestToPin", 2)?.id).toBe("c");
    expect(entryFor(c, 2)?.strokes.length).toBe(3);
  });

  it("every contest hole is listed whether or not anybody has claimed it", () => {
    const c = awardContest(four(), "closestToPin", 2, "c", tick());
    const results = contestResults(c);
    expect(results.map((r) => r.hole)).toEqual([2, 3, 5, 6]);
    expect(results.filter((r) => r.winner).length).toBe(1);
    expect(results.find((r) => r.hole === 5)?.contest).toBe("closestToPin");
  });
});

describe("points, which are a pot", () => {
  const tenEachOnCtp: PointValues = {
    enabled: true,
    shotKept: { on: false, each: 0 },
    longestDrive: { on: false, each: 0 },
    closestToPin: { on: true, each: 10 },
  };

  /** The case the whole model was rebuilt for, written the way it was asked for. */
  it("ten each on a closest to the pin makes the winner thirty and everybody else minus ten", () => {
    const c = awardContest(four(tenEachOnCtp), "closestToPin", 2, "c", tick());
    const rows = pointsBoard(c);
    expect(rows.find((r) => r.player.id === "c")?.points).toBe(30);
    expect(rows.find((r) => r.player.id === "d")?.points).toBe(-10);
    expect(rows.find((r) => r.player.id === "p")?.points).toBe(-10);
    expect(rows.find((r) => r.player.id === "s")?.points).toBe(-10);
    expect(rows.reduce((n, r) => n + r.points, 0)).toBe(0);
  });

  it("two winners pay into each other", () => {
    let c = four(tenEachOnCtp);
    c = awardContest(c, "closestToPin", 2, "c", tick());
    c = awardContest(c, "closestToPin", 5, "d", tick());
    const rows = pointsBoard(c);
    expect(rows.find((r) => r.player.id === "c")?.points).toBe(20);
    expect(rows.find((r) => r.player.id === "d")?.points).toBe(20);
    expect(rows.find((r) => r.player.id === "p")?.points).toBe(-20);
    expect(rows.reduce((n, r) => n + r.points, 0)).toBe(0);
  });

  it("an unclaimed hole costs nobody anything", () => {
    const rows = pointsBoard(four(tenEachOnCtp));
    expect(rows.every((r) => r.points === 0)).toBe(true);
  });

  it("a row says what it won and what it put in", () => {
    const c = awardContest(four(tenEachOnCtp), "closestToPin", 2, "c", tick());
    const rows = pointsBoard(c);
    const corey = rows.find((r) => r.player.id === "c")!;
    const dan = rows.find((r) => r.player.id === "d")!;
    expect([corey.won, corey.paid]).toEqual([30, 0]);
    expect([dan.won, dan.paid]).toEqual([0, 10]);
  });

  it("a stake on a contest that is not being played is not in the game", () => {
    const c: ScrambleCard = {
      ...four(tenEachOnCtp),
      contests: { longestDrive: true, closestToPin: false },
    };
    const claimed = awardContest(c, "closestToPin", 2, "c", tick());
    expect(pointsBoard(claimed).every((r) => r.points === 0)).toBe(true);
  });

  it("shots kept are a pot too", () => {
    const values: PointValues = {
      enabled: true,
      shotKept: { on: true, each: 1 },
      longestDrive: { on: false, each: 0 },
      closestToPin: { on: false, each: 0 },
    };
    let c = four(values);
    c = shot(c, 1, "c");
    c = finishHole(c, 1, true, tick());
    const rows = pointsBoard(c);
    // One shot kept, four playing: Corey takes three, the other three pay one each.
    expect(rows.find((r) => r.player.id === "c")?.points).toBe(3);
    expect(rows.find((r) => r.player.id === "d")?.points).toBe(-1);
    expect(rows.reduce((n, r) => n + r.points, 0)).toBe(0);
  });

  it("the board is built even when nobody is counting points", () => {
    const off = { ...tenEachOnCtp, enabled: false };
    const c = awardContest(four(off), "closestToPin", 2, "c", tick());
    expect(pointsBoard(c).find((r) => r.player.id === "c")?.points).toBe(30);
  });

  it("a tie on the net shares a place", () => {
    let c = four(tenEachOnCtp);
    c = awardContest(c, "closestToPin", 2, "c", tick());
    c = awardContest(c, "closestToPin", 5, "d", tick());
    const rows = pointsBoard(c);
    expect(rows[0]!.place).toBe(1);
    expect(rows[1]!.place).toBe(1);
    expect(rows[2]!.place).toBe(3);
  });

  it("the stakes line says each and only what is being played", () => {
    expect(pointsLine(four(tenEachOnCtp))).toBe("10 each on a closest to the pin");
    expect(pointsLine(four({ ...tenEachOnCtp, closestToPin: { on: false, each: 10 } }))).toBe(
      "Nothing is being played for yet.",
    );
  });

  it("the winnings line does the arithmetic out loud", () => {
    expect(winningsLine({ on: true, each: 10 }, 4)).toBe("Worth 30 to whoever takes it, 10 from each of the other 3.");
    expect(winningsLine({ on: true, each: 10 }, 1)).toBe("Nobody else to play it with yet.");
  });
});

/**
 * Two phones, one card.
 *
 * The rule is per hole and last-write-wins, which is the whole reason a hole has carried its own
 * `updatedAt` since the model was written. These are the three shapes that actually happen: two
 * people on different holes, two people on the same hole, and somebody changing the settings while
 * somebody else plays.
 */
describe("merging two copies of one card", () => {
  const at = (n: number) => new Date(Date.parse(CREATED) + n * 60_000).toISOString();

  const withHole = (base: ScrambleCard, hole: number, playerId: string, when: string): ScrambleCard => ({
    ...base,
    holes: [
      ...base.holes.filter((h) => h.hole !== hole),
      { hole, strokes: [newStroke("shot", playerId, `${hole}-${playerId}`)], finished: true, updatedAt: when, awards: [] },
    ].sort((a, b) => a.hole - b.hole),
  });

  it("keeps both holes when two people played different ones", () => {
    const mine = withHole(card(), 1, "c", at(1));
    const theirs = withHole(card(), 2, "d", at(2));
    const merged = mergeCards(mine, theirs);
    expect(merged.holes.map((h) => h.hole)).toEqual([1, 2]);
  });

  it("the later write wins the hole outright", () => {
    const early = withHole(card(), 1, "c", at(1));
    const late = withHole(card(), 1, "d", at(5));
    expect(mergeCards(early, late).holes[0]!.strokes[0]!.playerId).toBe("d");
    expect(mergeCards(late, early).holes[0]!.strokes[0]!.playerId).toBe("d");
  });

  it("the settings move as one unit, on their own clock", () => {
    const renamed: ScrambleCard = {
      ...card(),
      name: "Sunday",
      players: [{ id: "c", name: "Corey W" }, { id: "d", name: "Dan" }, { id: "p", name: "Pete" }, { id: "s", name: "Sam" }],
      settingsUpdatedAt: at(9),
    };
    const played = withHole(card(), 1, "c", at(3));
    const merged = mergeCards(played, renamed);
    expect(merged.name).toBe("Sunday");
    expect(merged.players[0]!.name).toBe("Corey W");
    expect(merged.holes.map((h) => h.hole)).toEqual([1]);
  });

  it("never changes the card's identity", () => {
    const mine = card();
    const theirs: ScrambleCard = { ...card(), id: "other", createdAt: at(99), settingsUpdatedAt: at(99) };
    const merged = mergeCards(mine, theirs);
    expect(merged.id).toBe("card");
    expect(merged.createdAt).toBe(CREATED);
  });
});

/**
 * Reading a card off the wire.
 *
 * The posture is the Swift model's hand-written decoder: a card is somebody's afternoon, and the
 * failure mode of strictness is an empty screen where a round was. A missing field takes its
 * default; only an envelope with no id, no players or no pars is refused.
 */
describe("parsing a card", () => {
  const wire = () => ({
    id: "card",
    name: "Saturday",
    createdAt: CREATED,
    players: [{ id: "c", name: "Corey" }, { id: "d", name: "Dan" }],
    pars: STANDARD_PARS,
    holes: [{ hole: 1, strokes: [{ id: "s1", kind: "shot", playerId: "c" }], finished: true, updatedAt: CREATED, awards: [] }],
  });

  it("fills in everything a card saved before a field existed does not carry", () => {
    const c = parseCard(wire())!;
    expect(c.course).toBe("");
    expect(c.contests).toEqual({ longestDrive: false, closestToPin: false });
    expect(c.points.closestToPin).toEqual({ on: true, each: 10 });
    expect(c.settingsUpdatedAt).toBe(CREATED);
  });

  it("refuses only an envelope that could not draw a card at all", () => {
    expect(parseCard(null)).toBeNull();
    expect(parseCard({ ...wire(), id: "" })).toBeNull();
    expect(parseCard({ ...wire(), players: [] })).toBeNull();
    expect(parseCard({ ...wire(), pars: [] })).toBeNull();
  });

  it("a stroke naming somebody who is not on the card becomes nobody's", () => {
    const c = parseCard({
      ...wire(),
      holes: [{ hole: 1, strokes: [{ id: "s1", kind: "shot", playerId: "ghost" }], finished: true, updatedAt: CREATED }],
    })!;
    expect(c.holes[0]!.strokes[0]!.kind).toBe("unclaimed");
    expect(entryFor(c, 1)?.strokes.length).toBe(1);
    expect(tallyRows(c).every((r) => r.kept === 0)).toBe(true);
  });

  it("a hole with no strokes cannot arrive finished", () => {
    const c = parseCard({ ...wire(), holes: [{ hole: 1, strokes: [], finished: true, updatedAt: CREATED }] })!;
    expect(c.holes[0]!.finished).toBe(false);
    expect(isComplete(c)).toBe(false);
  });

  it("clamps a stake and a par that arrive outside the range", () => {
    const c = parseCard({
      ...wire(),
      pars: [9, 1, 4],
      points: { enabled: true, closestToPin: { on: true, each: 999 } },
    })!;
    expect(c.pars).toEqual([6, 3, 4]);
    expect(c.points.closestToPin.each).toBe(50);
  });
});
