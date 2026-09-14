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

/** What the asking account may open. Both are false for a player, which is nearly everyone. */
export interface Roles {
  /** Runs this pool: the roster, its name, its invite. */
  commissioner: boolean;
  /** Runs the league: results, the schedule, the feed. Above any one pool. */
  platformAdmin: boolean;
}

export interface PoolDTO {
  id: string;
  slug: string;
  name: string;
  type: string;
}

export interface BootstrapResponse {
  now: string;
  /** Build id of the deployed Worker; the client reloads when its own differs. */
  build: string;
  season: number;
  /** The pool's display name. Kept alongside `pool` because every older client reads this one. */
  poolName: string;
  pool?: PoolDTO;
  roles?: Roles;
  /** Week where picking should happen right now. */
  currentWeek: number;
  /** Latest week with started games — the results view default. */
  boardWeek: number;
  /** First week that counts towards the season total; earlier weeks stand on their own. */
  seasonFromWeek: number;
  weeks: WeekSummary[];
  players: RosterPlayer[];
  me: Player | null;
  account?: Player | null;
  myEntries?: Player[];
  /** Your own claim code, for adding another device. Only sent to an authenticated device. */
  myCode?: string;
  /** How many passkeys this identity has for this host — 0 means we can offer to add one. */
  myPasskeys?: number;
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

export interface CommissionerGameDTO extends GameDTO {
  picks: { playerId: string; name: string; team: string; rank: number }[];
}
export interface CommissionerWeekResponse {
  now: string;
  week: number;
  games: CommissionerGameDTO[];
  players: Player[];
}

/** The league office's view of a week: the games and their results, and nobody's picks. */
export interface LeagueWeekResponse {
  now: string;
  week: number;
  games: GameDTO[];
}

export interface PoolSummary extends PoolDTO {
  season: number;
  createdAt: string;
}

export interface RoleHolder {
  id: string;
  name: string;
  grantedAt: string;
}

export interface CommissionerOverview {
  now: string;
  pool: PoolSummary;
  playerCount: number;
  readyCount: number;
  /** Names on the roster that no device has signed in as yet. */
  unclaimedCount: number;
  commissioners: RoleHolder[];
  roles: Roles;
}

export interface RolesResponse {
  pool: { id: string; slug: string; name: string };
  roles: Roles;
}

export interface ClaimRolesResponse {
  roles: Roles;
  pool: { id: string; slug: string; name: string };
  commissioners: RoleHolder[];
}

export interface SetResultRequest {
  winner: string | null;
  awayScore?: number | null;
  homeScore?: number | null;
}
export interface CommissionerPlayerDTO extends Player {
  createdAt: string;
  lastSeenAt: string;
  picksCount: number;
  weeksPlayed: number;
  /** How many devices are signed in as this player. */
  devices: number;
  /** The code that claims this name on a new device; null for names created before codes. */
  code: string | null;
  /** The commissioner's checkmark — squared away for the season. Commissioner API only. */
  ready: boolean;
}

export interface CommissionerResetAccessResponse {
  player: Player;
  code: string;
}
export interface CommissionerPlayersResponse {
  players: CommissionerPlayerDTO[];
}

export interface PullResultsRequest {
  /** Limit the pull to one week. Omit to sweep the season. */
  week?: number;
}
export interface PullResultsResponse {
  ok: boolean;
  reason?: string;
  applied: number;
  confirmed: number;
  pending: number;
  conflicts: { gameId: string; recorded: string; feed: string; awayScore: number; homeScore: number }[];
  syncedAt: string;
}

export interface PasskeyOptionsResponse {
  challengeId: string;
  /** Passed straight to the browser's WebAuthn call. */
  options: Record<string, unknown>;
}

export interface PasskeyAuthResponse {
  player: Player;
  token: string;
}
