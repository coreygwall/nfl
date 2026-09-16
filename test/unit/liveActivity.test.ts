import { describe, expect, it } from "vitest";
import { activityPayload, activityPhase, buildActivityState, picksSettled, staleEpochFor, statusLine } from "../../shared/live-activity.ts";
import type { Game, Pick } from "../../shared/types.ts";

/**
 * The lock screen, from the server's side.
 *
 * This is the half nobody can watch: the app draws the same state when it is open, but on a Sunday
 * afternoon it is shut and these numbers are the only ones anybody sees. There is no preview and
 * no simulator for that, so the rules are pure and tested here instead.
 */

const NOW = "2026-09-13T18:30:00.000Z";
const t = (offsetMinutes: number) => new Date(Date.parse(NOW) + offsetMinutes * 60_000).toISOString();

function game(id: string, away: string, home: string, opts: { winner?: string; kickoff?: number } = {}): Game {
  return {
    id,
    season: 2026,
    week: 2,
    kickoffAt: t(opts.kickoff ?? -180),
    away: away as Game["away"],
    home: home as Game["home"],
    neutral: false,
    venue: null,
    winner: (opts.winner ?? null) as Game["winner"],
    awayScore: null,
    homeScore: null,
  };
}

const pick = (gameId: string, team: string, rank: number): Pick => ({ gameId, team: team as Pick["team"], rank });

describe("the state the Worker pushes", () => {
  it("scores only what has finished, and keeps the rest as what is still to play for", () => {
    const state = buildActivityState({
      picks: [pick("a", "BUF", 1), pick("b", "KC", 2), pick("c", "SF", 3)],
      games: [
        game("a", "BUF", "HOU", { winner: "BUF" }),
        game("b", "KC", "DEN", { winner: "DEN" }),
        game("c", "SF", "SEA", { kickoff: 90 }),
      ],
      now: NOW,
    });
    expect(state.points).toBe(5);
    expect(state.possible).toBe(3);
    expect(state.slots.map((s) => s.state)).toEqual(["won", "lost", "waiting"]);
  });

  /**
   * The bug this whole change exists to fix. Their five are done at four o'clock; the week is not,
   * and their place moves for hours afterwards. `weekFinal` is the only thing allowed to end an
   * activity, and it is a fact about the slate, not about them.
   */
  it("does not call the week over just because this entry is done", () => {
    const state = buildActivityState({
      picks: [pick("a", "BUF", 1)],
      games: [game("a", "BUF", "HOU", { winner: "BUF" }), game("z", "SF", "SEA", { kickoff: 120 })],
      now: NOW,
    });
    expect(picksSettled(state)).toBe(true);
    expect(state.weekFinal).toBe(false);
  });

  it("calls the week over once every game has a result", () => {
    const state = buildActivityState({
      picks: [pick("a", "BUF", 1)],
      games: [game("a", "BUF", "HOU", { winner: "BUF" }), game("z", "SF", "SEA", { winner: "SEA" })],
      now: NOW,
    });
    expect(state.weekFinal).toBe(true);
  });

  /** `every` on an empty list is true, which would push a lock screen announcing a week that has no games. */
  it("does not call an empty schedule a finished week", () => {
    expect(buildActivityState({ picks: [], games: [], now: NOW }).weekFinal).toBe(false);
  });

  it("counts down to the reader's next game, not the league's", () => {
    const state = buildActivityState({
      picks: [pick("mine", "BUF", 1)],
      games: [
        // Somebody else's game kicks off sooner. It is not news to a person with no pick in it.
        game("theirs", "NYJ", "NE", { kickoff: 30 }),
        game("mine", "BUF", "HOU", { kickoff: 90 }),
      ],
      now: NOW,
    });
    expect(state.nextKickoffEpoch).toBe(Math.floor(Date.parse(t(90)) / 1000));
  });

  it("keeps a hidden pick's place without naming the team", () => {
    const state = buildActivityState({
      picks: [pick("a", "BUF", 1)],
      games: [game("a", "BUF", "HOU", { winner: "BUF" })],
      hiddenRanks: [4],
      now: NOW,
    });
    expect(state.slots).toEqual([
      { rank: 1, team: "BUF", state: "won" },
      { rank: 4, team: null, state: "waiting" },
    ]);
    expect(state.possible).toBe(2);
  });
});

describe("the payload Apple is handed", () => {
  const state = buildActivityState({
    picks: [pick("a", "BUF", 1)],
    games: [game("a", "BUF", "HOU", { kickoff: 60 })],
    now: NOW,
  });

  it("wraps the state the way ActivityKit expects to find it", () => {
    const payload = activityPayload({ state, now: NOW, event: "update", staleEpoch: 123 }) as {
      aps: Record<string, unknown>;
    };
    expect(payload.aps.event).toBe("update");
    expect(payload.aps["content-state"]).toBe(state);
    expect(payload.aps.timestamp).toBe(Math.floor(Date.parse(NOW) / 1000));
    expect(payload.aps["stale-date"]).toBe(123);
  });

  /** Ending without a dismissal date snatches the week's result away at the final whistle. */
  it("leaves the final state up for a while when it ends", () => {
    const payload = activityPayload({ state, now: NOW, event: "end" }) as { aps: Record<string, unknown> };
    expect(payload.aps.event).toBe("end");
    expect(payload.aps["dismissal-date"]).toBe(Math.floor(Date.parse(NOW) / 1000) + 4 * 3600);
  });

  /**
   * Every time in this payload is Unix seconds. ActivityKit decodes `content-state` with a stock
   * JSONDecoder, which reads a Swift `Date` as seconds since 2001 — so a date-shaped field here
   * would land 31 years out with nothing to say why.
   */
  it("carries times as Unix seconds and never as a date string", () => {
    const json = JSON.stringify(activityPayload({ state, now: NOW, event: "update" }));
    expect(json).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(typeof state.nextKickoffEpoch).toBe("number");
  });

  it("trusts a live score for half an hour and a quiet gap until the next kickoff", () => {
    const live = buildActivityState({
      picks: [pick("a", "BUF", 1)],
      games: [game("a", "BUF", "HOU", { kickoff: -10 })],
      now: NOW,
    });
    expect(staleEpochFor(live, NOW)).toBe(Math.floor(Date.parse(NOW) / 1000) + 30 * 60);
    expect(staleEpochFor(state, NOW)).toBe((state.nextKickoffEpoch ?? 0) + 30 * 60);
  });
});

/**
 * The five phases, and the sentence each one says.
 *
 * A Sunday is not "running" or "over": it is the gap between the early games and the late ones,
 * and the hour after your last pick has played when your points are fixed and your place is not.
 * Both of those used to end the lock screen, which is exactly when somebody wants it. The same
 * rule drives the picks tab, so these sentences are the ones on both surfaces at once.
 */
describe("where the week has got to, from one entry's seat", () => {
  const clock = () => "4:05 PM";
  const two = [pick("a", "BUF", 1), pick("b", "KC", 2)];
  const line = (games: Game[], extra: { place?: number; field?: number } = {}) =>
    statusLine(buildActivityState({ picks: two, games, now: NOW, ...extra }), { clock });
  const phase = (games: Game[]) => activityPhase(buildActivityState({ picks: two, games, now: NOW }));

  it("says when it starts before anything has", () => {
    const games = [game("a", "BUF", "HOU", { kickoff: 60 }), game("b", "KC", "DEN", { kickoff: 120 })];
    expect(phase(games)).toBe("locked");
    expect(line(games)).toBe("Picks are in — first game 4:05 PM.");
  });

  it("says what is on now, and what it is worth", () => {
    const games = [game("a", "BUF", "HOU"), game("b", "KC", "DEN", { kickoff: 120 })];
    expect(phase(games)).toBe("live");
    expect(line(games)).toBe("1 game on now · 9 still to play for.");
  });

  it("names the next kickoff in the gap between slates", () => {
    const games = [game("a", "BUF", "HOU", { winner: "BUF" }), game("b", "KC", "DEN", { kickoff: 120 })];
    expect(phase(games)).toBe("between");
    expect(line(games)).toBe("Back at 4:05 PM · 1 game left, worth 4.");
  });

  it("admits the points have stopped moving while the place has not", () => {
    const games = [
      game("a", "BUF", "HOU", { winner: "BUF" }),
      game("b", "KC", "DEN", { winner: "DEN" }),
      // Somebody else's game, still running: this entry is done and the week is not.
      game("c", "SF", "SEA"),
    ];
    expect(phase(games)).toBe("watching");
    expect(line(games)).toBe("All five in. Your place can still move.");
  });

  it("calls the week once every game in it has a result", () => {
    const games = [game("a", "BUF", "HOU", { winner: "BUF" }), game("b", "KC", "DEN", { winner: "KC" })];
    expect(phase(games)).toBe("final");
    expect(line(games, { place: 1, field: 12 })).toBe("You won the week on 9 points.");
    expect(line(games, { place: 4, field: 12 })).toBe("4th of 12 on 9 points.");
  });

  it("says nothing it cannot stand behind when the scores are stale", () => {
    const games = [game("a", "BUF", "HOU"), game("b", "KC", "DEN", { kickoff: 120 })];
    const state = buildActivityState({ picks: two, games, now: NOW });
    expect(statusLine(state, { stale: true, clock })).toBe("Scores may be behind.");
  });
});
