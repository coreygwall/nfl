import { pointsForRank } from "./scoring.ts";
import type { Segment } from "./segments.ts";
import type { Abbr } from "./teams.ts";
import { TEAMS } from "./teams.ts";

/**
 * What a notification says.
 *
 * Kept away from the plumbing on purpose: the wording is the part that gets fiddled with, and it
 * should be possible to read every message this app can send in one file and test them without a
 * push certificate. Nothing here knows about Apple, D1, or the time of day.
 */

export type NotificationKind = "picksDue" | "segment" | "weekDone";

export interface Notification {
  kind: NotificationKind;
  title: string;
  body: string;
  /** Groups messages about one entry together in Notification Centre. */
  threadId: string;
  /** Where tapping it should land. */
  path: string;
}

const ordinal = (n: number): string => {
  const teens = n % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** "the Bills", "the Bills and the Chiefs", "the Bills, the Chiefs and the Rams". */
function list(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const nickname = (abbr: Abbr): string => `the ${TEAMS[abbr].nickname}`;

export interface EntryRef {
  playerId: string;
  name: string;
  /** True when this account runs more than one entry, which changes how we address them. */
  oneOfMany: boolean;
}

const thread = (entry: EntryRef) => `entry:${entry.playerId}`;

/** Leading with the entry name only matters to someone running several. */
const who = (entry: EntryRef) => (entry.oneOfMany ? `${entry.name}: ` : "");

// MARK: Picks due

export interface PicksDueInput {
  entry: EntryRef;
  week: number;
  /** How many of the five are set. */
  picksMade: number;
  /** Minutes until the first game of the slate they are about to miss. */
  minutesToKickoff: number;
  path: string;
}

/**
 * The nudge before a slate starts. It is the only message that is trying to get someone to do
 * something, so it says the deadline and how much is left, and nothing else.
 */
export function picksDue(input: PicksDueInput): Notification {
  const { entry, picksMade, week, minutesToKickoff } = input;
  const hours = Math.round(minutesToKickoff / 60);
  const when = hours >= 2 ? `in about ${plural(hours, "hour")}` : minutesToKickoff >= 45 ? "in under an hour" : "very soon";
  const missing = 5 - picksMade;
  const body =
    picksMade === 0
      ? `Week ${week} kicks off ${when} and you have not picked yet. Five teams, ranked.`
      : `Week ${week} kicks off ${when}. You have ${picksMade} of five — ${plural(missing, "more pick")} to go.`;
  return {
    kind: "picksDue",
    title: `${who(entry)}Time to pick`,
    body,
    threadId: thread(entry),
    path: input.path,
  };
}

// MARK: A slate settled

export interface SegmentResult {
  team: Abbr;
  rank: number;
  won: boolean;
  tied: boolean;
}

export interface SegmentSettledInput {
  entry: EntryRef;
  segment: Pick<Segment, "label" | "week">;
  /** This entry's picks in the slate that just finished. */
  results: SegmentResult[];
  /** Points this entry has for the week so far, across every slate. */
  weekPoints: number;
  /** Games this entry still has to come this week, and what they are worth. */
  remaining: { games: number; points: number };
  path: string;
}

/**
 * A slate is done. The shape of this is deliberate: what just happened, then where that leaves
 * them, then what is still live — because the last one is the reason to keep watching.
 */
export function segmentSettled(input: SegmentSettledInput): Notification {
  const { entry, segment, results, weekPoints, remaining } = input;
  const won = results.filter((r) => r.won);
  const gained = won.reduce((sum, r) => sum + pointsForRank(r.rank), 0);

  const headline =
    won.length === results.length
      ? results.length === 1
        ? `${nickname(results[0]!.team)} came through`
        : "Clean sweep"
      : won.length === 0
        ? results.length === 1
          ? `${nickname(results[0]!.team)} lost`
          : "Nothing landed"
        : `${won.length} of ${results.length}`;

  const detail = won.length
    ? `${list(won.map((r) => nickname(r.team)))} won — ${plural(gained, "point")} from ${segment.label}.`
    : `No points from ${segment.label}.`;

  const standing = `You are on ${weekPoints} for Week ${segment.week}.`;
  const ahead = remaining.games
    ? ` ${plural(remaining.games, "game")} still to play, worth ${plural(remaining.points, "point")}.`
    : " That is all your games in.";

  return {
    kind: "segment",
    title: `${who(entry)}${headline}`,
    body: `${detail} ${standing}${ahead}`,
    threadId: thread(entry),
    path: input.path,
  };
}

// MARK: The week is over

export interface WeekDoneInput {
  entry: EntryRef;
  week: number;
  points: number;
  place: number;
  /** How many entries the week was contested by. */
  field: number;
  /** Null before the season race starts, or when there is nothing to say yet. */
  season: { place: number; points: number; field: number; fromWeek: number } | null;
  path: string;
}

/** The wrap-up. Where they finished, then where the season stands. */
export function weekDone(input: WeekDoneInput): Notification {
  const { entry, week, points, place, field, season } = input;
  const headline = place === 1 ? `You won Week ${week}` : `${ordinal(place)} in Week ${week}`;
  const weekLine = `${plural(points, "point")}, ${ordinal(place)} of ${field}.`;
  const seasonLine = season
    ? season.place === 1
      ? ` You lead the season on ${plural(season.points, "point")}.`
      : ` ${ordinal(season.place)} of ${season.field} for the season, on ${plural(season.points, "point")}.`
    : "";
  return {
    kind: "weekDone",
    title: `${who(entry)}${headline}`,
    body: `${weekLine}${seasonLine}`,
    threadId: thread(entry),
    path: input.path,
  };
}
