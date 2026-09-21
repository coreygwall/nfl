import type { Abbr } from "./teams.ts";
import type { Game, Pick, Player } from "./types.ts";
import { isLocked, SEASON_START_WEEK } from "./week.ts";
import { MAX_PICKS } from "./picks.ts";

export const pointsForRank = (rank: number): number => MAX_PICKS + 1 - rank;

/**
 * "1st", "2nd", "11th". Written once here because the board, home and the week's status line all
 * say a place out loud, and the two copies this replaced disagreed about how they got there — one
 * special-cased the teens, the other leaned on a `(v - 20) % 10` trick. `Scoring.ordinal` in
 * TallyKit is the same rule for the app.
 */
export function ordinal(n: number): string {
  const teens = n % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}
export const MAX_WEEK_POINTS = Array.from({ length: MAX_PICKS }, (_, i) => pointsForRank(i + 1)).reduce((a, b) => a + b, 0);

export type Outcome = "win" | "loss" | "tie" | "pending";

export function scorePick(pick: Pick, game: Game): { outcome: Outcome; points: number } {
  if (game.winner === null) return { outcome: "pending", points: 0 };
  if (game.winner === "TIE") return { outcome: "tie", points: 0 };
  if (game.winner === pick.team) return { outcome: "win", points: pointsForRank(pick.rank) };
  return { outcome: "loss", points: 0 };
}

export interface PlayerPick extends Pick {
  playerId: string;
}

export interface ScoredPick {
  gameId: string;
  team: Abbr;
  rank: number;
  points: number;
  outcome: Outcome;
}

export interface WeekRow {
  playerId: string;
  name: string;
  /** The entry the request was made as. One row at most. */
  isMe: boolean;
  /**
   * An entry the asking *account* owns — the active one and every other name it picks for. A
   * phone that picks for the family is one reader, so the board tells it apart from the field
   * on every row that is its own, and shows it those rows' picks whole (see `picks`).
   */
  mine: boolean;
  place: number;
  points: number;
  correct: number;
  fives: number;
  picksMade: number;
  /** Points still reachable this week (current points + pending picks). */
  possible: number;
  /** Only picks whose game has kicked off, plus all of the asking account's own entries'. */
  picks: ScoredPick[];
  /**
   * Ranks held by picks that are still hidden. The team stays secret until kickoff, but the rank
   * does not need to: it lets the board draw every pick in its own slot, so five places are
   * visible from the start and fill in as games begin, rather than a row that grows sideways.
   */
  hiddenRanks: number[];
}

export interface WeekBoard {
  week: number;
  gameCount: number;
  finalCount: number;
  lockedCount: number;
  rows: WeekRow[];
}

export interface SeasonRow {
  playerId: string;
  name: string;
  isMe: boolean;
  /** Owned by the asking account — see `WeekRow.mine`. */
  mine: boolean;
  place: number;
  points: number;
  correct: number;
  fives: number;
  /** Points banked plus everything still live in undecided games. */
  possible: number;
  weeksPlayed: number;
  bestWeek: { week: number; points: number } | null;
  byWeek: Record<number, number>;
}

export interface SeasonBoard {
  season: number;
  /** First week that counts towards the season total. Earlier weeks are played for their own sake. */
  fromWeek: number;
  /** Latest counting week that has started, or 0 before the season race begins. */
  throughWeek: number;
  rows: SeasonRow[];
}

interface Rankable {
  points: number;
  correct: number;
  fives: number;
  name: string;
}

export function compareRows(a: Rankable, b: Rankable): number {
  return (
    b.points - a.points ||
    b.correct - a.correct ||
    b.fives - a.fives ||
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
}

/** Sorts and assigns shared places (1, 1, 3) for rows tied on every ranking key. */
export function assignPlaces<T extends Rankable & { place: number }>(rows: T[]): T[] {
  const sorted = [...rows].sort(compareRows);
  let place = 0;
  sorted.forEach((row, i) => {
    const prev = sorted[i - 1];
    const tied = prev && prev.points === row.points && prev.correct === row.correct && prev.fives === row.fives;
    if (!tied) place = i + 1;
    row.place = place;
  });
  return sorted;
}

/**
 * Whose picks a board shows before kickoff.
 *
 * The rule used to be "the requester's, and nobody else's", which quietly made a family phone
 * worse than a browser: picking as Parker, you could not see what you had put in for Declan
 * without switching to Declan, and switching is a bootstrap. The account owns every entry it
 * picks for, so every one of those is *yours to see* — `revealIds` is that set, and the
 * requester alone is only the default for a caller that has not said otherwise.
 */
export function revealed(requesterId: string | null | undefined, revealIds: Iterable<string> | null | undefined): Set<string> {
  const set = new Set(revealIds ?? []);
  if (requesterId) set.add(requesterId);
  return set;
}

export function buildWeekBoard(input: {
  week: number;
  players: Player[];
  picks: PlayerPick[];
  games: Game[];
  now: string;
  requesterId?: string | null;
  /** Every entry the asking account owns. Shown in full, marked `mine`. Defaults to the requester. */
  revealIds?: Iterable<string> | null;
}): WeekBoard {
  const { week, players, picks, games, now, requesterId } = input;
  const reveal = revealed(requesterId, input.revealIds);
  const weekGames = games.filter((g) => g.week === week);
  const gamesById = new Map(weekGames.map((g) => [g.id, g]));
  const byPlayer = new Map<string, PlayerPick[]>();
  for (const p of picks) {
    if (!gamesById.has(p.gameId)) continue;
    const list = byPlayer.get(p.playerId) ?? [];
    list.push(p);
    byPlayer.set(p.playerId, list);
  }
  const rows: WeekRow[] = players.map((player) => {
    const mine = (byPlayer.get(player.id) ?? []).sort((a, b) => a.rank - b.rank);
    let points = 0, correct = 0, fives = 0, possible = 0;
    const scored: ScoredPick[] = [];
    const hiddenRanks: number[] = [];
    for (const p of mine) {
      const game = gamesById.get(p.gameId)!;
      const { outcome, points: pts } = scorePick(p, game);
      points += pts;
      if (outcome === "win") {
        correct++;
        if (p.rank === 1) fives++;
      }
      possible += outcome === "pending" ? pointsForRank(p.rank) : pts;
      if (reveal.has(player.id) || isLocked(game, now)) {
        scored.push({ gameId: p.gameId, team: p.team, rank: p.rank, points: pts, outcome });
      } else {
        hiddenRanks.push(p.rank);
      }
    }
    return {
      playerId: player.id,
      name: player.name,
      isMe: player.id === requesterId,
      mine: reveal.has(player.id),
      place: 0,
      points,
      correct,
      fives,
      picksMade: mine.length,
      possible,
      picks: scored,
      hiddenRanks,
    };
  });
  return {
    week,
    gameCount: weekGames.length,
    finalCount: weekGames.filter((g) => g.winner !== null).length,
    lockedCount: weekGames.filter((g) => isLocked(g, now)).length,
    rows: assignPlaces(rows),
  };
}

export function buildSeasonBoard(input: {
  season: number;
  players: Player[];
  picks: PlayerPick[];
  games: Game[];
  now: string;
  requesterId?: string | null;
  /** Every entry the asking account owns, marked `mine`. Defaults to the requester. */
  revealIds?: Iterable<string> | null;
}): SeasonBoard {
  const { season, players, picks, games, now, requesterId } = input;
  const reveal = revealed(requesterId, input.revealIds);
  const gamesById = new Map(games.map((g) => [g.id, g]));
  const rows: SeasonRow[] = players.map((player) => ({
    playerId: player.id,
    name: player.name,
    isMe: player.id === requesterId,
    mine: reveal.has(player.id),
    place: 0,
    points: 0,
    correct: 0,
    fives: 0,
    possible: 0,
    weeksPlayed: 0,
    bestWeek: null,
    byWeek: {},
  }));
  const rowById = new Map(rows.map((r) => [r.playerId, r]));
  const weeksPlayed = new Map<string, Set<number>>();
  for (const p of picks) {
    const row = rowById.get(p.playerId);
    const game = gamesById.get(p.gameId);
    // Weeks before the season race began are the week's own contest and nothing more.
    if (!row || !game || game.week < SEASON_START_WEEK) continue;
    const set = weeksPlayed.get(p.playerId) ?? new Set<number>();
    set.add(game.week);
    weeksPlayed.set(p.playerId, set);
    const { outcome, points } = scorePick(p, game);
    row.points += points;
    row.possible += outcome === "pending" ? pointsForRank(p.rank) : points;
    row.byWeek[game.week] = (row.byWeek[game.week] ?? 0) + points;
    if (outcome === "win") {
      row.correct++;
      if (p.rank === 1) row.fives++;
    }
  }
  for (const row of rows) {
    row.weeksPlayed = weeksPlayed.get(row.playerId)?.size ?? 0;
    for (const [w, pts] of Object.entries(row.byWeek)) {
      const week = Number(w);
      if (!row.bestWeek || pts > row.bestWeek.points) row.bestWeek = { week, points: pts };
    }
  }
  const started = games.filter((g) => g.week >= SEASON_START_WEEK && isLocked(g, now)).map((g) => g.week);
  return {
    season,
    fromWeek: SEASON_START_WEEK,
    throughWeek: started.length ? Math.max(...started) : 0,
    rows: assignPlaces(rows),
  };
}
