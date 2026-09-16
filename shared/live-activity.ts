import { MAX_PICKS } from "./picks.ts";
import { pointsForRank } from "./scoring.ts";
import type { Game, Pick } from "./types.ts";

/**
 * The Live Activity's content state, mirrored from
 * `ios/TallyKit/Sources/TallyKit/LiveActivity/WeekActivity.swift`.
 *
 * The app builds one of these when it is open; the Worker builds the same one and pushes it when
 * it is not. Both have to agree exactly, because the thing on the other end is not our decoder —
 * it is ActivityKit's, and it will reject a payload whose shape is off by a key.
 *
 * Two things about that decoder are worth writing down, because neither announces itself:
 *
 * - It is a stock `JSONDecoder`, so a Swift `Date` would arrive as *seconds since 2001*. Every
 *   time here is a plain Unix-seconds `number` for that reason and must stay one.
 * - The whole APNs payload has a hard size limit. These fields are small and already-rendered on
 *   purpose: a widget process should be laying out numbers, not working them out.
 */

export type SlotState = "waiting" | "live" | "won" | "lost" | "tied";

export interface ActivitySlot {
  /** 1 is the most confident pick, worth 5. */
  rank: number;
  /** Null while a pick is still secret — nobody has kicked off, so the rank shows alone. */
  team: string | null;
  state: SlotState;
}

export interface ActivityContentState {
  slots: ActivitySlot[];
  points: number;
  possible: number;
  place: number | null;
  field: number | null;
  /**
   * Whether the *week* is over, which is a different question from whether this entry's five have
   * settled. It is the only thing that ends an activity: somebody whose last pick played at one
   * o'clock keeps their lock screen, because their position moves for another seven hours.
   */
  weekFinal: boolean;
  /** Unix seconds. See the note above about why this is not a date. */
  nextKickoffEpoch: number | null;
}

export interface BuildActivityInput {
  picks: Pick[];
  games: Game[];
  /** Ranks whose game has not kicked off: the rank is public, the team is not. */
  hiddenRanks?: number[];
  now: string;
  place?: number | null;
  field?: number | null;
}

/** The same walk the Swift does, in the same order, producing the same five slots. */
export function buildActivityState(input: BuildActivityInput): ActivityContentState {
  const { picks, games, hiddenRanks = [], now } = input;
  const t = Date.parse(now);
  const byId = new Map(games.map((g) => [g.id, g]));
  const byRank = new Map(picks.map((p) => [p.rank, p]));
  const hidden = new Set(hiddenRanks);

  let points = 0;
  let possible = 0;
  const slots: ActivitySlot[] = [];

  for (let rank = 1; rank <= MAX_PICKS; rank++) {
    const pick = byRank.get(rank);
    if (!pick) {
      // A rank whose team is still secret is a slot; a rank nobody took is not.
      if (hidden.has(rank)) {
        possible += pointsForRank(rank);
        slots.push({ rank, team: null, state: "waiting" });
      }
      continue;
    }
    const game = byId.get(pick.gameId);
    let state: SlotState;
    if (game?.winner) {
      state = game.winner === "TIE" ? "tied" : game.winner === pick.team ? "won" : "lost";
    } else {
      state = game && Date.parse(game.kickoffAt) <= t ? "live" : "waiting";
    }
    if (state === "won") points += pointsForRank(rank);
    if (state === "waiting" || state === "live") possible += pointsForRank(rank);
    slots.push({ rank, team: pick.team, state });
  }

  // An empty slate is not a finished one, or a week the Worker has no schedule for would push a
  // lock screen that declares itself over.
  const weekFinal = games.length > 0 && games.every((g) => g.winner);

  // The next of *their* games. The next game in the league is not news to somebody with no pick
  // in it.
  const mine = new Set(picks.map((p) => p.gameId));
  const upcoming = games
    .filter((g) => mine.has(g.id) && !g.winner && Date.parse(g.kickoffAt) > t)
    .map((g) => Date.parse(g.kickoffAt));

  return {
    slots,
    points,
    possible,
    place: input.place ?? null,
    field: input.field ?? null,
    weekFinal,
    nextKickoffEpoch: upcoming.length ? Math.floor(Math.min(...upcoming) / 1000) : null,
  };
}

/** Every one of the five has a result. Their points are fixed; their place is not. */
export function picksSettled(state: ActivityContentState): boolean {
  return state.slots.every((s) => s.state !== "waiting" && s.state !== "live");
}

/** The payload shape ActivityKit expects: a normal `aps` dictionary with the state inside it. */
export function activityPayload(input: {
  state: ActivityContentState;
  now: string;
  /** `end` retires the activity on the phone; `update` rewrites it in place. */
  event: "update" | "end";
  /** When the system may stop trusting what it is showing. Unix seconds. */
  staleEpoch?: number;
  /** Shown if the phone has to summarise the change. */
  title?: string;
}): unknown {
  const timestamp = Math.floor(Date.parse(input.now) / 1000);
  const aps: Record<string, unknown> = {
    timestamp,
    event: input.event,
    "content-state": input.state,
  };
  if (input.staleEpoch) aps["stale-date"] = input.staleEpoch;
  // Ending without a dismissal date leaves the final score up rather than snatching it away the
  // moment the last whistle goes; the system caps how long it honours.
  if (input.event === "end") aps["dismissal-date"] = timestamp + 4 * 3600;
  if (input.title) aps.alert = { title: input.title, body: "" };
  return { aps };
}

/**
 * How long the phone should believe this. While a game is on, a score half an hour old is worth
 * doubting; in the gap before the next kickoff nothing can change, so the stale date is that
 * kickoff — an arbitrary clock would grey out a screen that is perfectly correct.
 */
export function staleEpochFor(state: ActivityContentState, now: string): number {
  const t = Math.floor(Date.parse(now) / 1000);
  if (state.slots.some((s) => s.state === "live")) return t + 30 * 60;
  if (state.nextKickoffEpoch) return state.nextKickoffEpoch + 30 * 60;
  return t + 2 * 3600;
}
