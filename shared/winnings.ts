import type { Game, Player } from "./types.ts";
import { buildSeasonBoard, buildWeekBoard, revealed, type PlayerPick } from "./scoring.ts";
import { WEEKS } from "./week.ts";

/**
 * Real money, kept apart from the pick-scoring numbers everywhere else on the board. "Points" and
 * "possible" already mean something else on every other screen; this is what somebody is actually
 * owed, so it is always spoken of as *winnings* and never as points, and always drawn with a `$`
 * rather than a bare number, so nobody mistakes one column for the other.
 */
export const WEEKLY_POT = 18;

/**
 * The season's own pot, on top of every week's. It pays out once, when the season itself is
 * decided — see `buildWinnings` for what "decided" means.
 */
export const SEASON_POT = 51;

/**
 * Said under the winnings card on both surfaces, every time it is drawn. Tally never holds, moves
 * or pays out money — the pot is something a group agrees among itself, the way an office pool
 * does, and this board is only the record of it. App Review reads a dollar sign as gambling unless
 * the screen says otherwise, and so, fairly, might anybody new to the pool. Mirrored as
 * `Winnings.noMoneyNote` and pinned by `winningsParity.test.ts`.
 */
export const NO_MONEY_NOTE = "Tally doesn't collect, hold or pay out money. This is a record of what your group agreed; settle up among yourselves.";

/**
 * One settled week: who was alone (or tied) in first once every one of its games had a result,
 * and what the pot came to for each of them. A tie splits the pot evenly rather than duplicating
 * it — three people tied for the win share one $18 pot three ways, they do not each get $18.
 */
export interface WeekWinnings {
  week: number;
  winnerIds: string[];
  winnerNames: string[];
  /** What each winner in `winnerIds` gets. Rounded to the cent — see `split`. */
  share: number;
}

export interface WinningsRow {
  playerId: string;
  name: string;
  isMe: boolean;
  /** An entry the asking account owns — see `WeekRow.mine`. Winnings are not hidden from anyone,
   *  this is only for the same "yours" highlight the other boards use. */
  mine: boolean;
  /** Shared place, ties included, the same way the other boards do it (1, 1, 3). */
  place: number;
  /** How many weeks this row won or shared, so a total that is all one week's split still says so. */
  weeksWon: number;
  /** Weekly pots won so far. */
  weekly: number;
  /** The season pot, once it has paid out — zero until then. */
  season: number;
  /** `weekly + season`: the number the board actually shows. */
  total: number;
}

export interface WinningsBoard {
  weeklyPot: number;
  seasonPot: number;
  /** Whether the season pot has a winner yet — see `buildWinnings`. */
  seasonSettled: boolean;
  /** Sorted by `total`, richest first. */
  rows: WinningsRow[];
  /** One entry per week that has fully settled, in week order. */
  weeks: WeekWinnings[];
}

/**
 * Splits a pot evenly among however many names are tied for it, to the cent. $18 among three is a
 * clean $6.00 each; $18 among four is $4.50; a split that does not land on the cent is rounded,
 * because a board that hands out fractions of a cent is a board nobody can actually pay out. A
 * rounded split can be a cent or two short of the pot in total, and that is the commissioner's to
 * eat, not this board's to solve — unlike a golf card's settle-up, nobody needs the column to add
 * back to a fixed number here, only for each person's own total to be right.
 */
function split(pot: number, winners: number): number {
  return Math.round((pot / winners) * 100) / 100;
}

/**
 * "$18", "$4.50" — the currency mark always, at most two decimals, and never a trailing zero
 * nobody asked for. `Winnings.label(_:)` in TallyKit is the same rule for the app, and
 * `winningsParity.test.ts` pins the two pot amounts together — a Swift build cannot see this file.
 */
export function moneyLabel(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return `$${Number.isInteger(rounded) ? rounded : rounded.toFixed(2)}`;
}

/** Shared place (1, 1, 3) on `total` alone — richest first, ties broken only for a stable order. */
function placeRows(rows: WinningsRow[]): WinningsRow[] {
  const sorted = [...rows].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  let place = 0;
  sorted.forEach((row, i) => {
    const prev = sorted[i - 1];
    if (!prev || prev.total !== row.total) place = i + 1;
    row.place = place;
  });
  return sorted;
}

/**
 * The real-money side of the pool: every week's $18, and the season's $51, settled and split.
 *
 * A week pays out the moment every one of its games has a result, whether or not the season race
 * has started yet — Week 1 crowns its own winner same as any other, `SEASON_START_WEEK` only
 * decides which weeks count towards the season pot, not which weeks pay their own. Nobody having
 * picked is the one way a week settles with no winner at all, and it is skipped rather than
 * counted as a winnerless split.
 *
 * The season pot pays out once, when the season's own last week (`WEEKS`) has a result for every
 * game — not on the season's current leader with weeks still to come, which is a guess wearing a
 * dollar sign. `buildSeasonBoard` already has the right tiebreak for who that is (points, correct,
 * fives, name), so this reuses its `place` rather than re-deriving it.
 */
export function buildWinnings(input: {
  season: number;
  players: Player[];
  picks: PlayerPick[];
  games: Game[];
  now: string;
  requesterId?: string | null;
  revealIds?: Iterable<string> | null;
}): WinningsBoard {
  const { season, players, picks, games, now, requesterId, revealIds } = input;
  const reveal = revealed(requesterId, revealIds);

  const weekly = new Map<string, number>();
  const weeksWon = new Map<string, number>();
  const weeks: WeekWinnings[] = [];

  const playedWeeks = [...new Set(games.map((g) => g.week))].sort((a, b) => a - b);
  for (const week of playedWeeks) {
    const weekGames = games.filter((g) => g.week === week);
    if (weekGames.length === 0 || weekGames.some((g) => g.winner === null)) continue; // not settled yet
    const board = buildWeekBoard({ week, players, picks, games, now, requesterId, revealIds });
    const winners = board.rows.filter((r) => r.place === 1 && r.picksMade > 0);
    if (winners.length === 0) continue; // settled, but nobody picked
    const share = split(WEEKLY_POT, winners.length);
    for (const w of winners) {
      weekly.set(w.playerId, (weekly.get(w.playerId) ?? 0) + share);
      weeksWon.set(w.playerId, (weeksWon.get(w.playerId) ?? 0) + 1);
    }
    weeks.push({ week, winnerIds: winners.map((w) => w.playerId), winnerNames: winners.map((w) => w.name), share });
  }

  const lastWeekGames = games.filter((g) => g.week === WEEKS);
  const seasonSettled = lastWeekGames.length > 0 && lastWeekGames.every((g) => g.winner !== null);
  const seasonShare = new Map<string, number>();
  if (seasonSettled) {
    const seasonBoard = buildSeasonBoard({ season, players, picks, games, now, requesterId, revealIds });
    const winners = seasonBoard.rows.filter((r) => r.place === 1 && r.weeksPlayed > 0);
    if (winners.length > 0) {
      const share = split(SEASON_POT, winners.length);
      for (const w of winners) seasonShare.set(w.playerId, share);
    }
  }

  const rows: WinningsRow[] = players.map((p) => {
    const w = weekly.get(p.id) ?? 0;
    const s = seasonShare.get(p.id) ?? 0;
    return {
      playerId: p.id,
      name: p.name,
      isMe: p.id === requesterId,
      mine: reveal.has(p.id),
      place: 0,
      weeksWon: weeksWon.get(p.id) ?? 0,
      weekly: w,
      season: s,
      total: Math.round((w + s) * 100) / 100,
    };
  });

  return { weeklyPot: WEEKLY_POT, seasonPot: SEASON_POT, seasonSettled, rows: placeRows(rows), weeks };
}
