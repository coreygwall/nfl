import type { Abbr } from "./teams.ts";
import { pointsForRank } from "./scoring.ts";
import type { Game, Pick } from "./types.ts";
import { offsetAt } from "./tz.ts";

/**
 * A week does not finish all at once, and nobody experiences it one game at a time either. It
 * finishes in slates: the Thursday game, the early Sunday window, the late one, Sunday night,
 * Monday night. That is the unit people talk in ("how did I do in the 1:00 games?"), so it is the
 * unit we tell them about — one message per slate they had a pick in, rather than five in a row as
 * the games trickle to a close.
 */
export type SegmentKey = "thu" | "fri" | "sat" | "sunEarly" | "sunLate" | "sunNight" | "mon" | "late";

/** Where the league lives. Slates are wall-clock things, so they are read in Eastern time. */
export const LEAGUE_TZ = "America/New_York";

interface Zoned {
  weekday: number; // 0 Sunday … 6 Saturday
  minutes: number; // minutes past local midnight
}

function zoned(iso: string, timeZone: string): Zoned {
  const t = Date.parse(iso);
  const local = new Date(t + offsetAt(t, timeZone));
  return { weekday: local.getUTCDay(), minutes: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

/**
 * Which slate a kickoff belongs to. The boundaries sit in the dead air between windows, so a game
 * that moves by a few minutes — or a London game at 9:30am — still lands where a viewer would put
 * it. Sunday's split is at 3:00pm (nothing kicks between 1:25 and 4:05) and 6:30pm.
 */
export function segmentOf(kickoffAt: string, timeZone: string = LEAGUE_TZ): SegmentKey {
  const { weekday, minutes } = zoned(kickoffAt, timeZone);
  switch (weekday) {
    case 4:
      return "thu";
    case 5:
      return "fri";
    case 6:
      return "sat";
    case 1:
      return "mon";
    case 0:
      if (minutes < 15 * 60) return "sunEarly";
      if (minutes < 18 * 60 + 30) return "sunLate";
      return "sunNight";
    default:
      // Tuesday and Wednesday games happen (a postponement, a Christmas oddity). They are nobody's
      // routine, so they get their own bucket rather than distorting one of the named slates.
      return "late";
  }
}

/** The order slates settle in, so a week's segments read top to bottom. */
const ORDER: SegmentKey[] = ["thu", "fri", "sat", "sunEarly", "sunLate", "sunNight", "mon", "late"];

export interface Segment {
  key: SegmentKey;
  week: number;
  /** "Thursday night", "the 1:00 games" — how the notification refers to it, lower case mid-sentence. */
  label: string;
  games: Game[];
  firstKickoff: string;
  lastKickoff: string;
  /** Every game in the slate has a result. */
  settled: boolean;
}

const FIXED: Partial<Record<SegmentKey, string>> = {
  thu: "Thursday night",
  fri: "Friday's game",
  sat: "Saturday's games",
  sunNight: "Sunday night",
  mon: "Monday night",
  late: "the last games",
};

/**
 * Name the Sunday slates after the clock, because that is what everyone calls them — and read the
 * clock off the games rather than hard-coding 1:00, so a slate whose games all moved is still
 * described correctly. A London game at 9:30 does not rename the early window: the busiest kickoff
 * in the slate wins.
 */
function label(key: SegmentKey, games: Game[], timeZone: string): string {
  const fixed = FIXED[key];
  if (fixed) return fixed;
  const counts = new Map<number, number>();
  for (const g of games) {
    const { minutes } = zoned(g.kickoffAt, timeZone);
    counts.set(minutes, (counts.get(minutes) ?? 0) + 1);
  }
  let best = 13 * 60;
  let seen = -1;
  for (const [minutes, n] of counts) {
    if (n > seen || (n === seen && minutes < best)) {
      best = minutes;
      seen = n;
    }
  }
  const hour = Math.floor(best / 60) % 12 || 12;
  const minute = best % 60;
  const clock = minute === 0 ? `${hour}:00` : `${hour}:${String(minute).padStart(2, "0")}`;
  return `the ${clock} games`;
}

/** Split one week's games into the slates they finish in, earliest first. Empty slates are dropped. */
export function weekSegments(games: Game[], timeZone: string = LEAGUE_TZ): Segment[] {
  const byKey = new Map<SegmentKey, Game[]>();
  for (const g of games) {
    const key = segmentOf(g.kickoffAt, timeZone);
    const list = byKey.get(key) ?? [];
    list.push(g);
    byKey.set(key, list);
  }
  return ORDER.filter((k) => byKey.has(k)).map((key) => {
    const list = byKey.get(key)!.slice().sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt));
    return {
      key,
      week: list[0]!.week,
      label: label(key, list, timeZone),
      games: list,
      firstKickoff: list[0]!.kickoffAt,
      lastKickoff: list[list.length - 1]!.kickoffAt,
      settled: list.every((g) => g.winner !== null),
    };
  });
}

/**
 * A stable name for "this slate, this season" — the key we write down once a slate's message has
 * gone out, so a cron that runs every half hour does not send it again.
 */
export const segmentId = (season: number, week: number, key: SegmentKey): string => `${season}:${week}:${key}`;

/** Did this entry have anything riding on the slate? One pick is enough. */
export function picksInSegment<T extends Pick>(picks: T[], segment: Segment): T[] {
  const ids = new Set(segment.games.map((g) => g.id));
  return picks.filter((p) => ids.has(p.gameId));
}

export interface TeamResult {
  team: Abbr;
  rank: number;
  points: number;
  outcome: "win" | "loss" | "tie" | "pending";
}

/** What is still to come for an entry this week: the games not yet final, and what they could add. */
export function stillToPlay(picks: Pick[], games: Game[]): { games: number; points: number } {
  const byId = new Map(games.map((g) => [g.id, g]));
  let count = 0;
  let points = 0;
  for (const p of picks) {
    const game = byId.get(p.gameId);
    if (!game || game.winner !== null) continue;
    count += 1;
    points += pointsForRank(p.rank);
  }
  return { games: count, points };
}
