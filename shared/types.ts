import type { Abbr } from "./teams.ts";

export type Winner = Abbr | "TIE";

export interface Game {
  id: string;
  season: number;
  week: number;
  /** ISO-8601 UTC (Date.toISOString()). */
  kickoffAt: string;
  away: Abbr;
  home: Abbr;
  neutral: boolean;
  venue: string | null;
  winner: Winner | null;
  awayScore: number | null;
  homeScore: number | null;
}

export interface Pick {
  gameId: string;
  team: Abbr;
  rank: number;
}

export interface Player {
  id: string;
  name: string;
}

export type GameStatus = "upcoming" | "live" | "final";
