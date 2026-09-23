import type { Abbr } from "../shared/teams.ts";
import type { Game, Pick, Player, Winner } from "../shared/types.ts";
import type { PlayerPick } from "../shared/scoring.ts";
import { parsePrefs, type NotifyPrefs } from "../shared/notify-prefs.ts";
import { generatePoolCode, isPoolCodeShaped, normalizePoolCode } from "../shared/pool-codes.ts";

interface GameRow {
  id: string;
  season: number;
  week: number;
  kickoff_at: string;
  away: string;
  home: string;
  neutral: number;
  venue: string | null;
  winner: string | null;
  away_score: number | null;
  home_score: number | null;
  result_updated_at: string | null;
}

interface PlayerRow {
  id: string;
  name: string;
  name_key: string;
  created_at: string;
  last_seen_at: string;
  claim_code: string | null;
  claim_attempts: number | null;
  claim_locked_until: string | null;
  ready: number | null;
  ready_at: string | null;
  claim_requires_code: number | null;
  deleted_at?: string | null;
}

interface PickRow {
  player_id: string;
  game_id: string;
  week: number;
  team: string;
  rank: number;
  device_id?: string | null;
}

export interface PlayerRecord extends Player {
  nameKey: string;
  createdAt: string;
  lastSeenAt: string;
  /** The code that claims this name on another device. Null for names created before codes existed. */
  claimCode: string | null;
  claimAttempts: number;
  claimLockedUntil: string | null;
  /** Commissioner's checkmark: squared away for the season. Admin-only, never public. */
  ready: boolean;
  readyAt: string | null;
  /** True once this name has been claimed and reset: zero devices no longer means "open". */
  claimRequiresCode: boolean;
  /** Set when the account was deleted (`anonymiseAccount`). Nobody can get back into it. */
  deletedAt: string | null;
}

export interface ScheduleGame {
  id: string;
  week: number;
  kickoff: string;
  away: string;
  home: string;
  neutral: boolean;
  venue: string | null;
}

const toGame = (r: GameRow): Game => ({
  id: r.id,
  season: r.season,
  week: r.week,
  kickoffAt: r.kickoff_at,
  away: r.away as Abbr,
  home: r.home as Abbr,
  neutral: r.neutral === 1,
  venue: r.venue,
  winner: r.winner as Winner | null,
  awayScore: r.away_score,
  homeScore: r.home_score,
});

const toPlayer = (r: PlayerRow): PlayerRecord => ({
  id: r.id,
  name: r.name,
  nameKey: r.name_key,
  createdAt: r.created_at,
  lastSeenAt: r.last_seen_at,
  claimCode: r.claim_code ?? null,
  claimAttempts: r.claim_attempts ?? 0,
  claimLockedUntil: r.claim_locked_until ?? null,
  ready: r.ready === 1,
  readyAt: r.ready_at ?? null,
  claimRequiresCode: r.claim_requires_code === 1,
  deletedAt: r.deleted_at ?? null,
});

const toPick = (r: PickRow): PlayerPick => ({ playerId: r.player_id, gameId: r.game_id, team: r.team as Abbr, rank: r.rank });

export const publicPlayer = (p: Player): Player => ({ id: p.id, name: p.name });

// ---- games ----

export async function listGames(db: D1Database, season: number): Promise<Game[]> {
  const { results } = await db
    .prepare("SELECT * FROM games WHERE season = ? ORDER BY week, kickoff_at, id")
    .bind(season)
    .all<GameRow>();
  return results.map(toGame);
}

export async function listWeekGames(db: D1Database, season: number, week: number): Promise<Game[]> {
  const { results } = await db
    .prepare("SELECT * FROM games WHERE season = ? AND week = ? ORDER BY kickoff_at, id")
    .bind(season, week)
    .all<GameRow>();
  return results.map(toGame);
}

export async function getGame(db: D1Database, id: string): Promise<Game | null> {
  const row = await db.prepare("SELECT * FROM games WHERE id = ?").bind(id).first<GameRow>();
  return row ? toGame(row) : null;
}

/** Inserts new games and refreshes schedule fields of existing ones. Never touches results. */
export async function upsertGames(db: D1Database, season: number, games: ScheduleGame[]): Promise<number> {
  const stmt = db.prepare(
    `INSERT INTO games (id, season, week, kickoff_at, away, home, neutral, venue)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
     ON CONFLICT(id) DO UPDATE SET
       week = excluded.week, kickoff_at = excluded.kickoff_at, away = excluded.away,
       home = excluded.home, neutral = excluded.neutral, venue = excluded.venue`,
  );
  const chunk = 40;
  for (let i = 0; i < games.length; i += chunk) {
    await db.batch(
      games
        .slice(i, i + chunk)
        .map((g) => stmt.bind(g.id, season, g.week, g.kickoff, g.away, g.home, g.neutral ? 1 : 0, g.venue)),
    );
  }
  return games.length;
}

/** Moves kickoff/venue only. Week and teams stay put because picks reference them; results are never touched. */
export async function updateKickoffs(
  db: D1Database,
  rows: { id: string; kickoff: string; venue: string | null; neutral: boolean }[],
): Promise<void> {
  const stmt = db.prepare("UPDATE games SET kickoff_at = ?, venue = ?, neutral = ? WHERE id = ?");
  for (let i = 0; i < rows.length; i += 40) {
    await db.batch(rows.slice(i, i + 40).map((r) => stmt.bind(r.kickoff, r.venue, r.neutral ? 1 : 0, r.id)));
  }
}

export async function setResult(
  db: D1Database,
  id: string,
  winner: Winner | null,
  awayScore: number | null,
  homeScore: number | null,
  now: string,
): Promise<void> {
  await db
    .prepare("UPDATE games SET winner = ?, away_score = ?, home_score = ?, result_updated_at = ? WHERE id = ?")
    .bind(winner, awayScore, homeScore, winner === null ? null : now, id)
    .run();
}

/** Records several results at once. Only used by the nflverse pull; single edits go through setResult. */
export async function applyResults(
  db: D1Database,
  rows: { id: string; winner: Winner; awayScore: number; homeScore: number }[],
  now: string,
): Promise<number> {
  if (rows.length === 0) return 0;
  const stmt = db.prepare(
    "UPDATE games SET winner = ?2, away_score = ?3, home_score = ?4, result_updated_at = ?5 WHERE id = ?1 AND winner IS NULL",
  );
  const chunk = 40;
  for (let i = 0; i < rows.length; i += chunk) {
    await db.batch(rows.slice(i, i + chunk).map((r) => stmt.bind(r.id, r.winner, r.awayScore, r.homeScore, now)));
  }
  return rows.length;
}

// ---- players ----

export async function listPlayers(db: D1Database): Promise<PlayerRecord[]> {
  const { results } = await db.prepare("SELECT * FROM players ORDER BY name COLLATE NOCASE").all<PlayerRow>();
  return results.map(toPlayer);
}

export async function countPlayers(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT count(*) AS n FROM players").first<{ n: number }>();
  return row?.n ?? 0;
}

export async function getPlayer(db: D1Database, id: string): Promise<PlayerRecord | null> {
  const row = await db.prepare("SELECT * FROM players WHERE id = ?").bind(id).first<PlayerRow>();
  return row ? toPlayer(row) : null;
}

export async function findPlayerByKey(db: D1Database, nameKey: string): Promise<PlayerRecord | null> {
  const row = await db.prepare("SELECT * FROM players WHERE name_key = ?").bind(nameKey).first<PlayerRow>();
  return row ? toPlayer(row) : null;
}

export async function createPlayer(
  db: D1Database,
  p: { id: string; name: string; nameKey: string; now: string; claimCode: string },
): Promise<void> {
  await db
    .prepare("INSERT INTO players (id, name, name_key, created_at, last_seen_at, claim_code) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(p.id, p.name, p.nameKey, p.now, p.now, p.claimCode)
    .run();
}

// ---- devices ----

export interface DeviceRecord {
  id: string;
  playerId: string;
  createdAt: string;
  lastSeenAt: string;
}

/** The player this token belongs to and the device it came from, or null. Stamps the device as seen. */
export async function playerForToken(
  db: D1Database,
  tokenHash: string,
  now: string,
): Promise<{ player: PlayerRecord; deviceId: string } | null> {
  const row = await db
    .prepare(
      `SELECT p.*, d.id AS device_id FROM players p JOIN devices d ON d.player_id = p.id WHERE d.token_hash = ?`,
    )
    .bind(tokenHash)
    .first<PlayerRow & { device_id: string }>();
  if (!row) return null;
  await db.prepare("UPDATE devices SET last_seen_at = ? WHERE token_hash = ?").bind(now, tokenHash).run();
  return { player: toPlayer(row), deviceId: row.device_id };
}

export async function addDevice(
  db: D1Database,
  d: { id: string; playerId: string; tokenHash: string; now: string; issuedBy?: "self" | "admin" },
): Promise<void> {
  await db
    .prepare("INSERT INTO devices (id, player_id, token_hash, created_at, last_seen_at, issued_by) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(d.id, d.playerId, d.tokenHash, d.now, d.now, d.issuedBy ?? "self")
    .run();
}

export async function countDevices(db: D1Database, playerId: string): Promise<number> {
  const row = await db.prepare("SELECT count(*) AS n FROM devices WHERE player_id = ?").bind(playerId).first<{ n: number }>();
  return row?.n ?? 0;
}

export async function deviceCounts(db: D1Database): Promise<Map<string, number>> {
  const { results } = await db
    .prepare("SELECT player_id, count(*) AS n FROM devices GROUP BY player_id")
    .all<{ player_id: string; n: number }>();
  return new Map(results.map((r) => [r.player_id, r.n]));
}

export async function revokeDevices(db: D1Database, playerId: string): Promise<void> {
  await db.prepare("DELETE FROM devices WHERE player_id = ?").bind(playerId).run();
}

/**
 * Sets a fresh claim code and clears any lockout. `requireCode` is what a commissioner's reset
 * sets: the devices are gone, but the name is not back on the shelf for whoever asks first.
 */
export async function setClaimCode(db: D1Database, playerId: string, code: string, requireCode = false): Promise<void> {
  await db
    .prepare(
      requireCode
        ? "UPDATE players SET claim_code = ?, claim_attempts = 0, claim_locked_until = NULL, claim_requires_code = 1 WHERE id = ?"
        : "UPDATE players SET claim_code = ?, claim_attempts = 0, claim_locked_until = NULL WHERE id = ?",
    )
    .bind(code, playerId)
    .run();
}

export async function noteClaimFailure(db: D1Database, playerId: string, attempts: number, lockedUntil: string | null): Promise<void> {
  await db
    .prepare("UPDATE players SET claim_attempts = ?, claim_locked_until = ? WHERE id = ?")
    .bind(attempts, lockedUntil, playerId)
    .run();
}

export async function clearClaimFailures(db: D1Database, playerId: string): Promise<void> {
  await db.prepare("UPDATE players SET claim_attempts = 0, claim_locked_until = NULL WHERE id = ?").bind(playerId).run();
}

export interface RateLimitState {
  count: number;
  resetAt: string | null;
}

/** Reads a counter, treating an expired window as a fresh one. */
export async function rateLimit(db: D1Database, key: string, now: string): Promise<RateLimitState> {
  const row = await db
    .prepare("SELECT count, reset_at FROM rate_limits WHERE key = ?")
    .bind(key)
    .first<{ count: number; reset_at: string | null }>();
  if (!row) return { count: 0, resetAt: null };
  if (row.reset_at && Date.parse(row.reset_at) <= Date.parse(now)) return { count: 0, resetAt: null };
  return { count: row.count, resetAt: row.reset_at };
}

export async function noteRateLimit(db: D1Database, key: string, count: number, resetAt: string | null, now: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO rate_limits (key, count, reset_at, last_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(key) DO UPDATE SET count = ?2, reset_at = ?3, last_at = ?4`,
    )
    .bind(key, count, resetAt, now)
    .run();
}

export async function clearRateLimit(db: D1Database, key: string): Promise<void> {
  await db.prepare("DELETE FROM rate_limits WHERE key = ?").bind(key).run();
}

export async function touchPlayer(db: D1Database, id: string, now: string): Promise<void> {
  await db.prepare("UPDATE players SET last_seen_at = ? WHERE id = ?").bind(now, id).run();
}

export async function setPlayerReady(db: D1Database, id: string, ready: boolean, now: string): Promise<void> {
  await db
    .prepare("UPDATE players SET ready = ?, ready_at = ? WHERE id = ?")
    .bind(ready ? 1 : 0, ready ? now : null, id)
    .run();
}

export async function renamePlayer(db: D1Database, id: string, name: string, nameKey: string): Promise<void> {
  await db.prepare("UPDATE players SET name = ?, name_key = ? WHERE id = ?").bind(name, nameKey, id).run();
}

/**
 * Every entry an account picks for: its own row, then whatever `entry_owners` says it manages.
 * The board hands this to the scorer so a family phone sees all of its own picks before kickoff,
 * not just the one name it happens to be standing on.
 */
export async function ownedEntryIds(db: D1Database, accountId: string): Promise<Set<string>> {
  const owned = await db.prepare("SELECT player_id FROM entry_owners WHERE owner_id = ?").bind(accountId).all<{ player_id: string }>();
  return new Set([accountId, ...owned.results.map((row) => row.player_id)]);
}

export async function deletePlayer(db: D1Database, id: string): Promise<void> {
  // An account owns any entries it created. Removing an account from the commissioner view is
  // therefore an explicit family removal, not a foreign-key failure or an orphaned child.
  const owned = await db.prepare("SELECT player_id FROM entry_owners WHERE owner_id = ?").bind(id).all<{ player_id: string }>();
  const ids = [id, ...owned.results.map((row) => row.player_id)];
  const marks = ids.map(() => "?").join(", ");
  await db.batch([
    db.prepare(`DELETE FROM picks WHERE player_id IN (${marks})`).bind(...ids),
    db.prepare(`DELETE FROM devices WHERE player_id IN (${marks})`).bind(...ids),
    db.prepare("DELETE FROM entry_owners WHERE owner_id = ?").bind(id),
    db.prepare(`DELETE FROM players WHERE id IN (${marks})`).bind(...ids),
  ]);
}

/** What a deleted account is called on the board, forever after. */
export const FORMER_PLAYER = "Former player";

/**
 * Deletes an account the way Tally deletes one: everything that identifies the person or lets
 * anybody back in goes, and the picks stay. The account and every entry it manages are handled
 * alike, because a parent deleting the account that picks for their children is deleting the
 * children's entries too.
 *
 * Picks stay because they belong to other people's results as much as to this one: removing them
 * would rewrite past weekly winners and the winnings log for everybody who played that week.
 * `/privacy` says exactly this, and the Account page says it again before anybody confirms.
 *
 * `name_key` becomes unique per row (`deleted:<id>`), so any number of former players can sit on
 * one board and none of them blocks a new person from choosing a name. One batch, so a failure
 * halfway leaves nothing half-deleted.
 */
export async function anonymiseAccount(db: D1Database, accountId: string, now: string): Promise<void> {
  const owned = await db.prepare("SELECT player_id FROM entry_owners WHERE owner_id = ?").bind(accountId).all<{ player_id: string }>();
  const ids = [accountId, ...owned.results.map((row) => row.player_id)];
  const marks = ids.map(() => "?").join(", ");
  await db.batch([
    ...ids.map((id) =>
      db.prepare(
        `UPDATE players SET name = ?, name_key = ?, claim_code = NULL, claim_attempts = 0, claim_locked_until = NULL,
           claim_requires_code = 1, ready = 0, ready_at = NULL, deleted_at = ? WHERE id = ?`,
      ).bind(FORMER_PLAYER, `deleted:${id}`, now, id),
    ),
    db.prepare(`DELETE FROM devices WHERE player_id IN (${marks})`).bind(...ids),
    db.prepare(`DELETE FROM passkeys WHERE player_id IN (${marks})`).bind(...ids),
    db.prepare(`DELETE FROM passkey_challenges WHERE player_id IN (${marks})`).bind(...ids),
    db.prepare(`DELETE FROM push_tokens WHERE account_id IN (${marks}) OR player_id IN (${marks})`).bind(...ids, ...ids),
    db.prepare(`DELETE FROM live_activities WHERE player_id IN (${marks})`).bind(...ids),
    db.prepare(`DELETE FROM notifications_sent WHERE player_id IN (${marks})`).bind(...ids),
    db.prepare("DELETE FROM entry_owners WHERE owner_id = ?").bind(accountId),
    db.prepare("DELETE FROM pool_commissioners WHERE player_id = ?").bind(accountId),
    db.prepare("DELETE FROM platform_admins WHERE player_id = ?").bind(accountId),
    db.prepare("DELETE FROM pool_message_reactions WHERE account_id = ?").bind(accountId),
    db.prepare("UPDATE pool_messages SET author_account_id = NULL, author_name = ? WHERE author_account_id = ?").bind(FORMER_PLAYER, accountId),
    db.prepare("UPDATE pools SET created_by = NULL WHERE created_by = ?").bind(accountId),
    db.prepare(`UPDATE pick_history SET player_name = ? WHERE player_id IN (${marks})`).bind(FORMER_PLAYER, ...ids),
  ]);
}

/** A child entry belongs to its account; it deliberately has no independent recovery code. */
export async function ownerOfEntry(db: D1Database, playerId: string): Promise<PlayerRecord | null> {
  const row = await db
    .prepare("SELECT p.* FROM players p JOIN entry_owners e ON e.owner_id = p.id WHERE e.player_id = ?")
    .bind(playerId)
    .first<PlayerRow>();
  return row ? toPlayer(row) : null;
}

/** The reverse of `ownerOfEntry`, for every managed player at once — the roster needs to know
 *  which names are already spoken for without a query per row. */
export async function ownersByEntry(db: D1Database): Promise<Map<string, { id: string; name: string }>> {
  const { results } = await db
    .prepare("SELECT e.player_id, o.id AS owner_id, o.name AS owner_name FROM entry_owners e JOIN players o ON o.id = e.owner_id")
    .all<{ player_id: string; owner_id: string; owner_name: string }>();
  const byEntry = new Map<string, { id: string; name: string }>();
  for (const r of results) byEntry.set(r.player_id, { id: r.owner_id, name: r.owner_name });
  return byEntry;
}

/**
 * The other half of `POST /entries`. That route creates the player and the ownership row
 * together, which is the only way a player has ever gained an owner — until now. This attaches
 * one that already exists: joined the pool under its own name, already picking, already with a
 * history, and simply never linked to anyone's account because the account model did not create
 * it. The caller has already checked it is unowned and under the limit; this just writes the row.
 */
export async function attachEntry(db: D1Database, playerId: string, ownerId: string): Promise<void> {
  await db.prepare("INSERT INTO entry_owners (player_id, owner_id) VALUES (?, ?)").bind(playerId, ownerId).run();
}

export interface PlayerStats {
  playerId: string;
  picksCount: number;
  weeksPlayed: number;
}

export async function playerStats(db: D1Database): Promise<Map<string, PlayerStats>> {
  const { results } = await db
    .prepare("SELECT player_id, COUNT(*) AS picks_count, COUNT(DISTINCT week) AS weeks_played FROM picks GROUP BY player_id")
    .all<{ player_id: string; picks_count: number; weeks_played: number }>();
  return new Map(results.map((r) => [r.player_id, { playerId: r.player_id, picksCount: r.picks_count, weeksPlayed: r.weeks_played }]));
}

// ---- picks ----

export async function listPicks(db: D1Database, playerId: string, week: number): Promise<Pick[]> {
  const { results } = await db
    .prepare("SELECT * FROM picks WHERE player_id = ? AND week = ? ORDER BY rank")
    .bind(playerId, week)
    .all<PickRow>();
  return results.map((r) => ({ gameId: r.game_id, team: r.team as Abbr, rank: r.rank }));
}

export async function listWeekPicks(db: D1Database, week: number): Promise<PlayerPick[]> {
  const { results } = await db.prepare("SELECT * FROM picks WHERE week = ? ORDER BY rank").bind(week).all<PickRow>();
  return results.map(toPick);
}

export async function listAllPicks(db: D1Database): Promise<PlayerPick[]> {
  const { results } = await db.prepare("SELECT * FROM picks ORDER BY week, rank").all<PickRow>();
  return results.map(toPick);
}

/** Which picks the commissioner typed in on someone's behalf, rather than the player saving them. */
export async function commissionerWrittenPickKeys(db: D1Database): Promise<Set<string>> {
  const { results } = await db
    .prepare("SELECT player_id, game_id FROM picks WHERE entered_by = 'commissioner'")
    .all<{ player_id: string; game_id: string }>();
  return new Set(results.map((r) => `${r.player_id}:${r.game_id}`));
}

/**
 * Replaces a player's picks for a week atomically. Unless `ignoreLocks`, only picks on games that
 * have not kicked off (`kickoff_at > now`) are deleted, so a locked pick can never be removed here.
 */
export async function replacePicks(
  db: D1Database,
  playerId: string,
  week: number,
  picks: Pick[],
  now: string,
  ignoreLocks = false,
  /** The device that wrote them — the audit trail when one phone holds several players. */
  deviceId: string | null = null,
  /** Carried into the history copy so it stays readable after the player is gone. */
  playerName?: string,
  /** "commissioner" when someone else typed these in, which is what the export reports. */
  enteredBy: "player" | "commissioner" = "player",
): Promise<void> {
  const del = ignoreLocks
    ? db.prepare("DELETE FROM picks WHERE player_id = ?1 AND week = ?2").bind(playerId, week)
    : db
        .prepare(
          `DELETE FROM picks WHERE player_id = ?1 AND week = ?2
           AND game_id IN (SELECT id FROM games WHERE week = ?2 AND kickoff_at > ?3)`,
        )
        .bind(playerId, week, now);
  const ins = db.prepare(
    "INSERT INTO picks (player_id, game_id, week, team, rank, created_at, updated_at, device_id, entered_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  // The same picks, appended to a table nothing ever deletes from, inside the same transaction:
  // if the save happened, the copy happened. The name is denormalised on purpose — it has to
  // still be readable after the player row it came from is gone.
  const log = db.prepare(
    "INSERT INTO pick_history (saved_at, player_id, player_name, week, game_id, team, rank, device_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const name = playerName ?? playerId;
  await db.batch([
    del,
    ...picks.map((p) => ins.bind(playerId, p.gameId, week, p.team, p.rank, now, now, deviceId, enteredBy)),
    ...picks.map((p) => log.bind(now, playerId, name, week, p.gameId, p.team, p.rank, deviceId)),
  ]);
}

export interface HistoricPick {
  savedAt: string;
  playerId: string;
  playerName: string;
  week: number;
  gameId: string;
  team: string;
  rank: number;
}

/** Everything a player ever saved for a week, newest save first. The undo of last resort. */
export async function pickHistory(db: D1Database, opts: { playerName?: string; week?: number } = {}): Promise<HistoricPick[]> {
  const where: string[] = [];
  const binds: unknown[] = [];
  if (opts.playerName) {
    where.push("lower(player_name) = ?");
    binds.push(opts.playerName.toLowerCase());
  }
  if (opts.week !== undefined) {
    where.push("week = ?");
    binds.push(opts.week);
  }
  const sql = `SELECT saved_at, player_id, player_name, week, game_id, team, rank FROM pick_history
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY saved_at DESC, rank ASC LIMIT 500`;
  const rows = await db
    .prepare(sql)
    .bind(...binds)
    .all<{ saved_at: string; player_id: string; player_name: string; week: number; game_id: string; team: string; rank: number }>();
  return rows.results.map((r) => ({
    savedAt: r.saved_at,
    playerId: r.player_id,
    playerName: r.player_name,
    week: r.week,
    gameId: r.game_id,
    team: r.team,
    rank: r.rank,
  }));
}

// ---- meta ----

export async function getMeta(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare("SELECT value FROM meta WHERE key = ?").bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

export async function setMeta(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(key, value)
    .run();
}

// ---- passkeys ----

export interface PasskeyRecord {
  id: string;
  playerId: string;
  publicKey: string;
  counter: number;
  transports: string[] | null;
  rpId: string;
  createdAt: string;
  lastUsedAt: string | null;
}

interface PasskeyRow {
  id: string;
  player_id: string;
  public_key: string;
  counter: number;
  transports: string | null;
  rp_id: string;
  created_at: string;
  last_used_at: string | null;
}

const toPasskey = (r: PasskeyRow): PasskeyRecord => ({
  id: r.id,
  playerId: r.player_id,
  publicKey: r.public_key,
  counter: r.counter,
  transports: r.transports ? (JSON.parse(r.transports) as string[]) : null,
  rpId: r.rp_id,
  createdAt: r.created_at,
  lastUsedAt: r.last_used_at,
});

export async function listPasskeys(db: D1Database, playerId: string, rpId: string): Promise<PasskeyRecord[]> {
  const { results } = await db
    .prepare("SELECT * FROM passkeys WHERE player_id = ? AND rp_id = ? ORDER BY created_at")
    .bind(playerId, rpId)
    .all<PasskeyRow>();
  return results.map(toPasskey);
}

export async function countPasskeys(db: D1Database, playerId: string, rpId: string): Promise<number> {
  const row = await db
    .prepare("SELECT count(*) AS n FROM passkeys WHERE player_id = ? AND rp_id = ?")
    .bind(playerId, rpId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function getPasskey(db: D1Database, id: string, rpId: string): Promise<PasskeyRecord | null> {
  const row = await db.prepare("SELECT * FROM passkeys WHERE id = ? AND rp_id = ?").bind(id, rpId).first<PasskeyRow>();
  return row ? toPasskey(row) : null;
}

export async function addPasskey(
  db: D1Database,
  p: { id: string; playerId: string; publicKey: string; counter: number; transports: string[] | null; rpId: string; now: string },
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO passkeys (id, player_id, public_key, counter, transports, rp_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(p.id, p.playerId, p.publicKey, p.counter, p.transports ? JSON.stringify(p.transports) : null, p.rpId, p.now)
    .run();
}

export async function notePasskeyUse(db: D1Database, id: string, counter: number, now: string): Promise<void> {
  await db.prepare("UPDATE passkeys SET counter = ?, last_used_at = ? WHERE id = ?").bind(counter, now, id).run();
}

export async function deletePasskeys(db: D1Database, playerId: string): Promise<void> {
  await db.prepare("DELETE FROM passkeys WHERE player_id = ?").bind(playerId).run();
}

/** Challenges live for a couple of minutes and are burned on use. */
export async function saveChallenge(
  db: D1Database,
  c: { id: string; playerId: string | null; challenge: string; expiresAt: string },
): Promise<void> {
  await db
    .prepare("INSERT OR REPLACE INTO passkey_challenges (id, player_id, challenge, expires_at) VALUES (?, ?, ?, ?)")
    .bind(c.id, c.playerId, c.challenge, c.expiresAt)
    .run();
}

export async function takeChallenge(
  db: D1Database,
  id: string,
  now: string,
): Promise<{ challenge: string; playerId: string | null } | null> {
  const row = await db
    .prepare("SELECT player_id, challenge, expires_at FROM passkey_challenges WHERE id = ?")
    .bind(id)
    .first<{ player_id: string | null; challenge: string; expires_at: string }>();
  await db.prepare("DELETE FROM passkey_challenges WHERE id = ? OR expires_at < ?").bind(id, now).run();
  if (!row || row.expires_at < now) return null;
  return { challenge: row.challenge, playerId: row.player_id };
}

// MARK: Push tokens

export interface PushTokenRecord {
  token: string;
  environment: "sandbox" | "production";
  accountId: string | null;
  playerId: string | null;
  /// Already parsed and normalised: every reader gets the same shape, including from rows an
  /// older build wrote in the flat form.
  prefs: NotifyPrefs;
}

interface PushTokenRow {
  token: string;
  environment: string;
  account_id: string | null;
  player_id: string | null;
  prefs: string;
}

const pushToken = (r: PushTokenRow): PushTokenRecord => {
  let prefs: NotifyPrefs = {};
  try {
    // A malformed blob, or one from an older build, both come back as "everything on" rather than
    // as silence — a phone that has gone quiet with no way to find out why is the worse failure.
    prefs = parsePrefs(JSON.parse(r.prefs));
  } catch {
    prefs = {};
  }
  return {
    token: r.token,
    environment: r.environment === "sandbox" ? "sandbox" : "production",
    accountId: r.account_id,
    playerId: r.player_id,
    prefs,
  };
};

/**
 * Record where an install can be reached. Re-registering is the normal case — the app does it on
 * every launch — so this is an upsert that also moves the token to whoever is signed in now.
 */
/**
 * Record where an install can be reached.
 *
 * **Registration deliberately does not touch `prefs`.** The app calls this on every launch, so an
 * upsert that wrote preferences would hand back whatever that build happened to send — which for
 * every build so far is nothing — and quietly reset the switches somebody set last week. It is the
 * same "looks like it works" failure the column already had, arrived at from the other end.
 * Preferences are their own write, through `savePushPrefs`.
 */
export async function savePushToken(
  db: D1Database,
  input: {
    token: string;
    environment: "sandbox" | "production";
    accountId: string | null;
    playerId: string | null;
    appVersion?: string | null;
  },
  now: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO push_tokens (token, environment, account_id, player_id, prefs, app_version, created_at, last_seen_at, retired_at)
       VALUES (?, ?, ?, ?, '{}', ?, ?, ?, NULL)
       ON CONFLICT(token) DO UPDATE SET
         environment = excluded.environment,
         account_id = excluded.account_id,
         player_id = excluded.player_id,
         app_version = excluded.app_version,
         last_seen_at = excluded.last_seen_at,
         retired_at = NULL`,
    )
    .bind(
      input.token,
      input.environment,
      input.accountId,
      input.playerId,
      input.appVersion ?? null,
      now,
      now,
    )
    .run();
}

/** The switches, and only the switches. Returns false when the token is not one we know. */
export async function savePushPrefs(
  db: D1Database,
  token: string,
  prefs: NotifyPrefs,
  now: string,
): Promise<boolean> {
  const result = await db
    .prepare("UPDATE push_tokens SET prefs = ?, last_seen_at = ? WHERE token = ? AND retired_at IS NULL")
    .bind(JSON.stringify(prefs), now, token)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

/** What this install currently has set, for a settings screen to draw. */
export async function getPushPrefs(db: D1Database, token: string): Promise<NotifyPrefs | null> {
  const row = await db
    .prepare("SELECT prefs FROM push_tokens WHERE token = ? AND retired_at IS NULL")
    .bind(token)
    .first<{ prefs: string }>();
  if (!row) return null;
  try {
    return parsePrefs(JSON.parse(row.prefs));
  } catch {
    return {};
  }
}

export async function deletePushToken(db: D1Database, token: string): Promise<void> {
  await db.prepare("DELETE FROM push_tokens WHERE token = ?").bind(token).run();
}

/** Marks a token Apple has rejected, rather than deleting it outright. */
export async function retirePushToken(db: D1Database, token: string, now: string): Promise<void> {
  await db.prepare("UPDATE push_tokens SET retired_at = ? WHERE token = ?").bind(now, token).run();
}

export async function listPushTokens(db: D1Database): Promise<PushTokenRecord[]> {
  const { results } = await db
    .prepare("SELECT token, environment, account_id, player_id, prefs FROM push_tokens WHERE retired_at IS NULL")
    .all<PushTokenRow>();
  return results.map(pushToken);
}

/**
 * Which entry each account can be notified about. An account's own player row counts — plenty of
 * people pick under the name they signed up with — as does everything they later added.
 */
export async function entriesByOwner(db: D1Database): Promise<Map<string, string[]>> {
  const { results } = await db
    .prepare("SELECT owner_id, player_id FROM entry_owners")
    .all<{ owner_id: string; player_id: string }>();
  const byOwner = new Map<string, string[]>();
  for (const r of results) {
    const list = byOwner.get(r.owner_id) ?? [];
    list.push(r.player_id);
    byOwner.set(r.owner_id, list);
  }
  return byOwner;
}

// MARK: What we have already said

/** The ids of messages already sent, so a cron running every half hour says each thing once. */
export async function sentNotificationIds(db: D1Database, since: string): Promise<Set<string>> {
  const { results } = await db
    .prepare("SELECT id FROM notifications_sent WHERE sent_at >= ?")
    .bind(since)
    .all<{ id: string }>();
  return new Set(results.map((r) => r.id));
}

/**
 * Claim a message before sending it. Returns false if another run got there first, which is what
 * makes two overlapping crons safe: the insert is the lock.
 */
export async function claimNotification(
  db: D1Database,
  input: { id: string; kind: string; playerId: string },
  now: string,
): Promise<boolean> {
  const res = await db
    .prepare("INSERT OR IGNORE INTO notifications_sent (id, kind, player_id, sent_at, delivered) VALUES (?, ?, ?, ?, 0)")
    .bind(input.id, input.kind, input.playerId, now)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function noteDelivered(db: D1Database, id: string, delivered: number): Promise<void> {
  await db.prepare("UPDATE notifications_sent SET delivered = ? WHERE id = ?").bind(delivered, id).run();
}

/** Undo a claim whose send found nobody to send to, so a later run can try again. */
export async function releaseNotification(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM notifications_sent WHERE id = ?").bind(id).run();
}

// ---- pools and roles ----

export interface PoolRecord {
  id: string;
  slug: string;
  name: string;
  type: string;
  season: number;
  createdAt: string;
  createdBy: string | null;
  /** The short code that gets somebody in. Minted on first sight; see `ensurePool`. */
  joinCode: string | null;
}

interface PoolRow {
  id: string;
  slug: string;
  name: string;
  type: string;
  season: number;
  created_at: string;
  created_by: string | null;
  join_code: string | null;
}

const toPool = (r: PoolRow): PoolRecord => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  type: r.type,
  season: r.season,
  createdAt: r.created_at,
  createdBy: r.created_by ?? null,
  joinCode: r.join_code ?? null,
});

export async function getPoolBySlug(db: D1Database, slug: string): Promise<PoolRecord | null> {
  const row = await db.prepare("SELECT * FROM pools WHERE slug = ?").bind(slug).first<PoolRow>();
  return row ? toPool(row) : null;
}

/** The pool a join code opens, or null. Normalised first, so "kdp 472" finds "KDP472". */
export async function getPoolByJoinCode(db: D1Database, code: string): Promise<PoolRecord | null> {
  const normalized = normalizePoolCode(code);
  if (!isPoolCodeShaped(normalized)) return null;
  const row = await db.prepare("SELECT * FROM pools WHERE join_code = ?").bind(normalized).first<PoolRow>();
  return row ? toPool(row) : null;
}

/**
 * Gives a pool a join code if it has none, and returns the pool either way.
 *
 * The retry is what the unique index is for: two pools minting at once is the only way to collide
 * in a space of six million, and losing that race has to mean rolling again rather than throwing.
 * A pool that somehow cannot be given a code still works — it has a link, which is how every pool
 * worked until now — so this never fails a request that was about something else.
 */
async function ensureJoinCode(db: D1Database, pool: PoolRecord): Promise<PoolRecord> {
  if (pool.joinCode) return pool;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generatePoolCode();
    const written = await db
      .prepare("UPDATE pools SET join_code = ? WHERE id = ? AND join_code IS NULL")
      .bind(code, pool.id)
      .run()
      .then(() => true)
      .catch(() => false);
    if (!written) continue;
    // Read back rather than trusting the write: another request may have won the race for this
    // row, in which case its code is the pool's and this one was never used.
    const fresh = await getPoolBySlug(db, pool.slug);
    if (fresh?.joinCode) return fresh;
  }
  return pool;
}

/**
 * The pool row, created on first sight from the deployment's own settings. Renaming it later is
 * the commissioner's to do, so the name is only ever written here when the row is new. The join
 * code is filled in here too, which is how the pool that predates the column gets one.
 */
export async function ensurePool(
  db: D1Database,
  pool: { slug: string; name: string; type: string; season: number; now: string },
): Promise<PoolRecord> {
  const existing = await getPoolBySlug(db, pool.slug);
  if (existing) return ensureJoinCode(db, existing);
  await db
    .prepare("INSERT OR IGNORE INTO pools (id, slug, name, type, season, created_at, join_code) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(pool.slug, pool.slug, pool.name, pool.type, pool.season, pool.now, generatePoolCode())
    .run();
  return ensureJoinCode(db, (await getPoolBySlug(db, pool.slug))!);
}

export async function renamePool(db: D1Database, poolId: string, name: string): Promise<void> {
  await db.prepare("UPDATE pools SET name = ? WHERE id = ?").bind(name, poolId).run();
}

export interface Roles {
  commissioner: boolean;
  platformAdmin: boolean;
}

export const NO_ROLES: Roles = { commissioner: false, platformAdmin: false };

/** Both memberships in one round trip, because every guarded request needs both answers. */
export async function rolesFor(db: D1Database, poolId: string, playerId: string): Promise<Roles> {
  const row = await db
    .prepare(
      `SELECT EXISTS(SELECT 1 FROM pool_commissioners WHERE pool_id = ? AND player_id = ?) AS commish,
              EXISTS(SELECT 1 FROM platform_admins WHERE player_id = ?) AS platform`,
    )
    .bind(poolId, playerId, playerId)
    .first<{ commish: number; platform: number }>();
  return { commissioner: row?.commish === 1, platformAdmin: row?.platform === 1 };
}

export async function grantCommissioner(
  db: D1Database,
  poolId: string,
  playerId: string,
  now: string,
  grantedBy: string | null,
): Promise<void> {
  await db
    .prepare("INSERT OR IGNORE INTO pool_commissioners (pool_id, player_id, granted_at, granted_by) VALUES (?, ?, ?, ?)")
    .bind(poolId, playerId, now, grantedBy)
    .run();
}

export async function revokeCommissioner(db: D1Database, poolId: string, playerId: string): Promise<void> {
  await db.prepare("DELETE FROM pool_commissioners WHERE pool_id = ? AND player_id = ?").bind(poolId, playerId).run();
}

export async function listCommissioners(db: D1Database, poolId: string): Promise<{ id: string; name: string; grantedAt: string }[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.name, c.granted_at FROM pool_commissioners c
         JOIN players p ON p.id = c.player_id
        WHERE c.pool_id = ? ORDER BY c.granted_at`,
    )
    .bind(poolId)
    .all<{ id: string; name: string; granted_at: string }>();
  return results.map((r) => ({ id: r.id, name: r.name, grantedAt: r.granted_at }));
}

export async function grantPlatformAdmin(db: D1Database, playerId: string, now: string, grantedBy: string | null): Promise<void> {
  await db
    .prepare("INSERT OR IGNORE INTO platform_admins (player_id, granted_at, granted_by) VALUES (?, ?, ?)")
    .bind(playerId, now, grantedBy)
    .run();
}

export async function listPlatformAdmins(db: D1Database): Promise<{ id: string; name: string; grantedAt: string }[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id, p.name, a.granted_at FROM platform_admins a
         JOIN players p ON p.id = a.player_id ORDER BY a.granted_at`,
    )
    .all<{ id: string; name: string; granted_at: string }>();
  return results.map((r) => ({ id: r.id, name: r.name, grantedAt: r.granted_at }));
}

// MARK: Live activities

/**
 * A lock screen this Worker can reach.
 *
 * One row per (entry, week) — the token is the primary key because ActivityKit reissues them, the
 * same way APNs does with device tokens. `ended_at` is set rather than the row deleted so a push
 * that arrives after the week closed is a no-op rather than a resurrection.
 */
export interface LiveActivityRecord {
  token: string;
  environment: "sandbox" | "production";
  playerId: string;
  week: number;
}

interface LiveActivityRow {
  token: string;
  environment: string;
  player_id: string;
  week: number;
}

export async function saveLiveActivity(
  db: D1Database,
  input: LiveActivityRecord,
  now: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO live_activities (token, environment, player_id, week, started_at, updated_at, ended_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)
       ON CONFLICT(token) DO UPDATE SET
         environment = excluded.environment,
         player_id = excluded.player_id,
         week = excluded.week,
         updated_at = excluded.updated_at,
         ended_at = NULL`,
    )
    .bind(input.token, input.environment, input.playerId, input.week, now, now)
    .run();
}

/** Every activity still believed to be on a lock screen, for the cron to update. */
export async function listLiveActivities(db: D1Database): Promise<LiveActivityRecord[]> {
  const { results } = await db
    .prepare("SELECT token, environment, player_id, week FROM live_activities WHERE ended_at IS NULL")
    .all<LiveActivityRow>();
  return results.map((r) => ({
    token: r.token,
    environment: r.environment === "sandbox" ? ("sandbox" as const) : ("production" as const),
    playerId: r.player_id,
    week: r.week,
  }));
}

export async function endLiveActivity(db: D1Database, token: string, now: string): Promise<void> {
  await db.prepare("UPDATE live_activities SET ended_at = ?, updated_at = ? WHERE token = ?").bind(now, now, token).run();
}

export async function touchLiveActivity(db: D1Database, token: string, now: string): Promise<void> {
  await db.prepare("UPDATE live_activities SET updated_at = ? WHERE token = ?").bind(now, token).run();
}
