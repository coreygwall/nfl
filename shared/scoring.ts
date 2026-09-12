import type { Abbr } from "./teams.ts";
import type { Game, Pick, Player } from "./types.ts";
import { isLocked } from "./week.ts";
import { MAX_PICKS } from "./picks.ts";

export const pointsForRank = (rank: number): number => MAX_PICKS + 1 - rank;
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
  isMe: boolean;
  place: number;
  points: number;
  correct: number;
  fives: number;
  picksMade: number;
  /** Points still reachable this week (current points + pending picks). */
  possible: number;
  /** Only picks whose game has kicked off, plus all of the requester's own. */
  picks: ScoredPick[];
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

export function buildWeekBoard(input: {
  week: number;
  players: Player[];
  picks: PlayerPick[];
  games: Game[];
  now: string;
  requesterId?: string | null;
}): WeekBoard {
  const { week, players, picks, games, now, requesterId } = input;
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
    for (const p of mine) {
      const game = gamesById.get(p.gameId)!;
      const { outcome, points: pts } = scorePick(p, game);
      points += pts;
      if (outcome === "win") {
        correct++;
        if (p.rank === 1) fives++;
      }
      possible += outcome === "pending" ? pointsForRank(p.rank) : pts;
      if (player.id === requesterId || isLocked(game, now)) {
        scored.push({ gameId: p.gameId, team: p.team, rank: p.rank, points: pts, outcome });
      }
    }
    return {
      playerId: player.id,
      name: player.name,
      isMe: player.id === requesterId,
      place: 0,
      points,
      correct,
      fives,
      picksMade: mine.length,
      possible,
      picks: scored,
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
}): SeasonBoard {
  const { season, players, picks, games, now, requesterId } = input;
  const gamesById = new Map(games.map((g) => [g.id, g]));
  const rows: SeasonRow[] = players.map((player) => ({
    playerId: player.id,
    name: player.name,
    isMe: player.id === requesterId,
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
    if (!row || !game) continue;
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
  const started = games.filter((g) => isLocked(g, now)).map((g) => g.week);
  return { season, throughWeek: started.length ? Math.max(...started) : 0, rows: assignPlaces(rows) };
}
