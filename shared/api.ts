import type { Game, GameStatus, Pick, Player } from "./types.ts";
import type { WeekSummary } from "./week.ts";
import type { SeasonBoard, WeekBoard } from "./scoring.ts";
import type { PickInput } from "./picks.ts";

export interface GameDTO extends Game {
  locked: boolean;
  status: GameStatus;
}

export interface BootstrapResponse {
  now: string;
  /** Build id of the deployed Worker; the client reloads when its own differs. */
  build: string;
  season: number;
  poolName: string;
  /** Week where picking should happen right now. */
  currentWeek: number;
  /** Latest week with started games — the results view default. */
  boardWeek: number;
  weeks: WeekSummary[];
  players: Player[];
  me: Player | null;
}

export interface CreatePlayerRequest {
  name: string;
}
export interface CreatePlayerResponse {
  player: Player;
  created: boolean;
}

export interface WeekResponse {
  now: string;
  week: number;
  games: GameDTO[];
  myPicks: Pick[];
  /** Pick tallies per game, only for games that have kicked off. */
  pickCounts: Record<string, { away: number; home: number }>;
  /** Players with at least one pick this week. */
  submitted: number;
}

export interface PutPicksRequest {
  picks: PickInput[];
}
export interface PutPicksResponse {
  now: string;
  picks: Pick[];
}

export interface WeekBoardResponse extends WeekBoard {
  now: string;
}
export interface SeasonBoardResponse extends SeasonBoard {
  now: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface AdminGameDTO extends GameDTO {
  picks: { playerId: string; name: string; team: string; rank: number }[];
}
export interface AdminWeekResponse {
  now: string;
  week: number;
  games: AdminGameDTO[];
  players: Player[];
}
export interface AdminSetResultRequest {
  winner: string | null;
  awayScore?: number | null;
  homeScore?: number | null;
}
export interface AdminPlayerDTO extends Player {
  createdAt: string;
  lastSeenAt: string;
  picksCount: number;
  weeksPlayed: number;
}
export interface AdminPlayersResponse {
  players: AdminPlayerDTO[];
}

export interface AdminPullResultsRequest {
  /** Limit the pull to one week. Omit to sweep the season. */
  week?: number;
}
export interface AdminPullResultsResponse {
  ok: boolean;
  reason?: string;
  applied: number;
  confirmed: number;
  pending: number;
  conflicts: { gameId: string; recorded: string; feed: string; awayScore: number; homeScore: number }[];
  syncedAt: string;
}
