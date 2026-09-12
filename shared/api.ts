import type { Game, GameStatus, Pick, Player } from "./types.ts";
import type { WeekSummary } from "./week.ts";
import type { SeasonBoard, WeekBoard } from "./scoring.ts";
import type { PickInput } from "./picks.ts";

export interface GameDTO extends Game {
  locked: boolean;
  status: GameStatus;
}

/** A player as everyone sees them, plus whether a device has claimed the name. */
export interface RosterPlayer extends Player {
  claimed: boolean;
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
  players: RosterPlayer[];
  me: Player | null;
  /** Your own claim code, for adding another device. Only sent to an authenticated device. */
  myCode?: string;
}

export interface CreatePlayerRequest {
  name: string;
}
export interface CreatePlayerResponse {
  player: Player;
  created: boolean;
  /** Present when this request earned the device its identity; store it, it is not shown again. */
  token?: string;
  /** The code that claims this name on another device. */
  code?: string;
}

export interface ClaimRequest {
  /** Omitted for a name nobody has claimed yet. */
  code?: string;
}

export interface ClaimResponse {
  player: Player;
  token: string;
  code: string;
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
  /** How many devices are signed in as this player. */
  devices: number;
  /** Of those, how many the commissioner put on their own phone. */
  adminDevices: number;
  /** The code that claims this name on a new device; null for names created before codes. */
  code: string | null;
  /** The commissioner's checkmark — squared away for the season. Admin API only. */
  ready: boolean;
}

export interface AdminDeviceResponse {
  player: Player;
  token: string;
}

export interface AdminResetAccessResponse {
  player: Player;
  code: string;
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
