import { describe, expect, it } from "vitest";
import { picksDue, segmentSettled, weekDone } from "../../shared/notify.ts";

const solo = { playerId: "p1", name: "Corey", oneOfMany: false };
const one = { playerId: "p2", name: "Corey's second", oneOfMany: true };

describe("the nudge", () => {
  it("says how long is left and how much is missing", () => {
    const n = picksDue({ entry: solo, week: 5, picksMade: 2, minutesToKickoff: 130, path: "/p/x/week/5" });
    expect(n.title).toBe("Time to pick");
    expect(n.body).toBe("Week 5 kicks off in about 2 hours. You have 2 of five — 3 more picks to go.");
  });

  it("reads differently when nothing is set", () => {
    const n = picksDue({ entry: solo, week: 5, picksMade: 0, minutesToKickoff: 120, path: "/" });
    expect(n.body).toBe("Week 5 kicks off in about 2 hours and you have not picked yet. Five teams, ranked.");
  });

  it("counts one remaining pick in the singular", () => {
    const n = picksDue({ entry: solo, week: 5, picksMade: 4, minutesToKickoff: 120, path: "/" });
    expect(n.body).toContain("1 more pick to go");
  });

  it("names the entry only for someone running more than one", () => {
    expect(picksDue({ entry: one, week: 5, picksMade: 0, minutesToKickoff: 120, path: "/" }).title).toBe(
      "Corey's second: Time to pick",
    );
  });

  it("drops the hour count once it is close", () => {
    expect(picksDue({ entry: solo, week: 5, picksMade: 1, minutesToKickoff: 50, path: "/" }).body).toContain(
      "in under an hour",
    );
    expect(picksDue({ entry: solo, week: 5, picksMade: 1, minutesToKickoff: 20, path: "/" }).body).toContain("very soon");
  });
});

describe("a slate settling", () => {
  const segment = { label: "the 1:00 games", week: 5 };

  it("leads with the result, then the running total, then what is left", () => {
    const n = segmentSettled({
      entry: solo,
      segment,
      results: [
        { team: "BUF", rank: 1, won: true, tied: false },
        { team: "KC", rank: 3, won: false, tied: false },
      ],
      weekPoints: 5,
      remaining: { games: 2, points: 6 },
      path: "/",
    });
    expect(n.title).toBe("1 of 2");
    expect(n.body).toBe(
      "the Bills won — 5 points from the 1:00 games. You are on 5 for Week 5. 2 games still to play, worth 6 points.",
    );
  });

  it("calls a full slate a sweep, and a single pick by name", () => {
    const sweep = segmentSettled({
      entry: solo,
      segment,
      results: [
        { team: "BUF", rank: 1, won: true, tied: false },
        { team: "KC", rank: 2, won: true, tied: false },
      ],
      weekPoints: 9,
      remaining: { games: 0, points: 0 },
      path: "/",
    });
    expect(sweep.title).toBe("Clean sweep");
    expect(sweep.body).toContain("the Bills and the Chiefs won — 9 points");
    expect(sweep.body).toContain("That is all your games in.");

    const alone = segmentSettled({
      entry: solo,
      segment: { label: "Thursday night", week: 5 },
      results: [{ team: "BUF", rank: 1, won: true, tied: false }],
      weekPoints: 5,
      remaining: { games: 4, points: 10 },
      path: "/",
    });
    expect(alone.title).toBe("the Bills came through");
  });

  it("says so plainly when nothing landed", () => {
    const n = segmentSettled({
      entry: solo,
      segment,
      results: [
        { team: "BUF", rank: 1, won: false, tied: false },
        { team: "KC", rank: 2, won: false, tied: false },
      ],
      weekPoints: 0,
      remaining: { games: 3, points: 6 },
      path: "/",
    });
    expect(n.title).toBe("Nothing landed");
    expect(n.body).toContain("No points from the 1:00 games.");
  });

  it("uses a singular game when one is left", () => {
    const n = segmentSettled({
      entry: solo,
      segment,
      results: [{ team: "BUF", rank: 5, won: true, tied: false }],
      weekPoints: 1,
      remaining: { games: 1, points: 5 },
      path: "/",
    });
    expect(n.body).toContain("1 game still to play, worth 5 points.");
    expect(n.body).toContain("1 point from the 1:00 games");
  });
});

describe("the week wrap-up", () => {
  it("leads with a win", () => {
    const n = weekDone({
      entry: solo,
      week: 5,
      points: 12,
      place: 1,
      field: 9,
      season: { place: 1, points: 41, field: 9, fromWeek: 2 },
      path: "/",
    });
    expect(n.title).toBe("You won Week 5");
    expect(n.body).toBe("12 points, 1st of 9. You lead the season on 41 points.");
  });

  it("puts an ordinary finish in its place", () => {
    const n = weekDone({
      entry: solo,
      week: 5,
      points: 7,
      place: 3,
      field: 9,
      season: { place: 2, points: 33, field: 9, fromWeek: 2 },
      path: "/",
    });
    expect(n.title).toBe("3rd in Week 5");
    expect(n.body).toBe("7 points, 3rd of 9. 2nd of 9 for the season, on 33 points.");
  });

  it("gets the teens right", () => {
    expect(weekDone({ entry: solo, week: 5, points: 2, place: 11, field: 20, season: null, path: "/" }).title).toBe(
      "11th in Week 5",
    );
    expect(weekDone({ entry: solo, week: 5, points: 2, place: 12, field: 20, season: null, path: "/" }).title).toBe(
      "12th in Week 5",
    );
    expect(weekDone({ entry: solo, week: 5, points: 2, place: 21, field: 30, season: null, path: "/" }).title).toBe(
      "21st in Week 5",
    );
  });

  it("says nothing about the season before the season race starts", () => {
    const n = weekDone({ entry: solo, week: 1, points: 9, place: 2, field: 9, season: null, path: "/" });
    expect(n.body).toBe("9 points, 2nd of 9.");
  });
});
