import type { Abbr } from "../shared/teams.ts";
import type { Game, Pick, Player, Winner } from "../shared/types.ts";
import type { PlayerPick } from "../shared/scoring.ts";

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

/** How many of a player's devices the commissioner handed out, rather than the player claiming them. */
export async function adminDeviceCounts(db: D1Database): Promise<Map<string, number>> {
  const { results } = await db
    .prepare("SELECT player_id, count(*) AS n FROM devices WHERE issued_by = 'admin' GROUP BY player_id")
    .all<{ player_id: string; n: number }>();
  return new Map(results.map((r) => [r.player_id, r.n]));
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

/** Sets a fresh claim code and clears any lockout. */
export async function setClaimCode(db: D1Database, playerId: string, code: string): Promise<void> {
  await db
    .prepare("UPDATE players SET claim_code = ?, claim_attempts = 0, claim_locked_until = NULL WHERE id = ?")
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

/** A child entry belongs to its account; it deliberately has no independent recovery code. */
export async function ownerOfEntry(db: D1Database, playerId: string): Promise<PlayerRecord | null> {
  const row = await db
    .prepare("SELECT p.* FROM players p JOIN entry_owners e ON e.owner_id = p.id WHERE e.player_id = ?")
    .bind(playerId)
    .first<PlayerRow>();
  return row ? toPlayer(row) : null;
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

/** Which picks came from a device the commissioner put on their own phone. */
export async function adminWrittenPickKeys(db: D1Database): Promise<Set<string>> {
  const { results } = await db
    .prepare("SELECT p.player_id, p.game_id FROM picks p JOIN devices d ON d.id = p.device_id WHERE d.issued_by = 'admin'")
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
    "INSERT INTO picks (player_id, game_id, week, team, rank, created_at, updated_at, device_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  await db.batch([del, ...picks.map((p) => ins.bind(playerId, p.gameId, week, p.team, p.rank, now, now, deviceId))]);
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
