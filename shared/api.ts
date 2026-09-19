import type { Game, GameStatus, Pick, Player } from "./types.ts";
import type { WeekSummary } from "./week.ts";
import type { SeasonBoard, WeekBoard } from "./scoring.ts";
import type { PickInput } from "./picks.ts";
import type { ScrambleCard } from "./golf.ts";

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
  /**
   * The short code that gets somebody in — `KDP472`, written `KDP-472`. Sent to everyone in the
   * pool rather than to its commissioner alone, because the pool's link is already public and
   * this is the same fact in a form you can say out loud; a pool grows when the person who is
   * already in it can invite their brother-in-law without going through anybody.
   */
  joinCode?: string | null;
}

/** What a join code resolves to. The host that answered is the pool's, so it is not repeated. */
export interface JoinLookupResponse {
  pool: PoolDTO;
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
  /**
   * Where the requester stands this week, once there is a board to stand on.
   *
   * It rides along with the week because the two are always wanted together — the lock screen and
   * the widgets both say "12 points, 2nd" — and because a client that had to fetch the board
   * separately would briefly show a week with no position, then flicker one in. Null when nobody
   * is signed in or the requester has no row yet.
   */
  standing: { place: number; field: number } | null;
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
  /**
   * Who already manages this entry, if anyone. Null is the ordinary case — most players are
   * independent people playing under their own name — not a sign that something is wrong, so a
   * client should not read it as a defect to flag on every such row.
   */
  owner: { id: string; name: string } | null;
}

/**
 * Brings a player who already exists — already picking, already with a history — under an
 * account that did not create them. The only other way a player gets an owner is `POST
 * /entries`, which creates the player and the ownership in the same breath; this is the path for
 * one that predates that, typically because they joined by typing their own name into the pool's
 * link rather than being added from someone else's account.
 */
export interface AttachEntryResponse {
  player: Player;
  ownerId: string;
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

/**
 * A shared golf card, as the link-holder's browser and the app both read it.
 *
 * `revision` is the cheap way to tell "nothing has changed since I last looked" from "somebody
 * else has been playing" — a client keeps the last one it saw and compares, rather than diffing
 * two cards to find out whether to redraw.
 */
export interface GolfCardResponse {
  token: string;
  revision: number;
  updatedAt: string;
  card: ScrambleCard;
}

export interface PublishCardResponse extends GolfCardResponse {
  /** False when the app asked for a link it already had. The share sheet says so either way. */
  created: boolean;
}
