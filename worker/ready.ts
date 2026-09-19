import schema from "../migrations/0001_init.sql?raw";
import devicesSchema from "../migrations/0002_devices.sql?raw";
import householdSchema from "../migrations/0003_household.sql?raw";
import readySchema from "../migrations/0004_ready.sql?raw";
import passkeySchema from "../migrations/0005_passkeys.sql?raw";
import entriesSchema from "../migrations/0006_account_entries.sql?raw";
import rateLimitSchema from "../migrations/0007_rate_limits.sql?raw";
import pickHistorySchema from "../migrations/0008_pick_history.sql?raw";
import pushSchema from "../migrations/0009_push.sql?raw";
import rolesSchema from "../migrations/0010_roles.sql?raw";
import messagesSchema from "../migrations/0011_messages.sql?raw";
import poolCodesSchema from "../migrations/0012_pool_codes.sql?raw";
import golfCardsSchema from "../migrations/0013_golf_cards.sql?raw";
import schedule from "../shared/schedule-2026.json";
import { finalsFromCsv, gamesFromCsv, NFLVERSE_GAMES_CSV } from "../shared/nflverse.ts";
import { applyResults, ensurePool, getMeta, listGames, setMeta, updateKickoffs, upsertGames } from "./db.ts";
import { isDev, type Env } from "./env.ts";
import type { Winner } from "../shared/types.ts";

export const SEASON = schedule.season;
export const SCHEDULE_VERSION = schedule.version;

const split = (sql: string) =>
  sql
    .split(/;\s*\n/)
    .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);

const statements = split(schema);
// Everything after the initial schema: additive, and safe to re-run.
const alterStatements = [...split(devicesSchema), ...split(householdSchema), ...split(readySchema), ...split(passkeySchema), ...split(entriesSchema), ...split(rateLimitSchema), ...split(pickHistorySchema), ...split(pushSchema), ...split(rolesSchema), ...split(messagesSchema), ...split(poolCodesSchema), ...split(golfCardsSchema)];
const SCHEMA_REVISION = "0013_golf_cards";
const SCHEMA_REVISION_KEY = "app_schema_revision";
const RUNTIME_REVISION_KEY = "app_runtime_revision";

function runtimeRevision(env: Env): string {
  return [SCHEMA_REVISION, SCHEDULE_VERSION, SEASON, env.POOL_SLUG || "high-five", env.POOL_TYPE || "High Five"].join(":");
}

function isMissingMetaTable(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /no such table(?::|\s).*meta/i.test(message);
}

async function applySchema(db: D1Database): Promise<void> {
  await db.batch(statements.map((s) => db.prepare(s)));
  // ALTER TABLE has no IF NOT EXISTS, so run these singly and let a second run no-op.
  for (const statement of alterStatements) {
    try {
      await db.prepare(statement).run();
    } catch (err) {
      if (!/duplicate column name/i.test(err instanceof Error ? err.message : String(err))) throw err;
    }
  }
}

/**
 * Existing production databases predate the revision marker. Confirm the *latest* migration's
 * artifacts once, then adopt the marker without replaying every migration in the request path.
 *
 * This has to name the newest migration, not a fixed one: adopting the marker skips `applySchema`
 * entirely, so a database checked against an older migration's tables would be marked current
 * while missing every column added after them. Each new migration adds its own check here.
 */
async function hasCurrentLegacySchema(db: D1Database): Promise<boolean> {
  const tables = await db.prepare(
    "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN (?, ?, ?)",
  ).bind("pool_communication_settings", "pool_messages", "pool_message_reactions").first<{ n: number }>();
  if (tables?.n !== 3) return false;
  const columns = await db.prepare("SELECT count(*) AS n FROM pragma_table_info('pools') WHERE name = ?")
    .bind("join_code")
    .first<{ n: number }>();
  if (columns?.n !== 1) return false;
  const cards = await db.prepare(
    "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?",
  ).bind("golf_cards").first<{ n: number }>();
  return cards?.n === 1;
}

async function prepareRuntime(env: Env): Promise<void> {
  const expectedRuntime = runtimeRevision(env);
  let metadataAvailable = true;
  let schemaRevision: string | null = null;
  let appliedSchema = false;

  try {
    const metadata = await env.DB.prepare(
      "SELECT key, value FROM meta WHERE key IN (?, ?)",
    ).bind(SCHEMA_REVISION_KEY, RUNTIME_REVISION_KEY).all<{ key: string; value: string }>();
    const values = new Map(metadata.results.map((row) => [row.key, row.value]));
    if (values.get(RUNTIME_REVISION_KEY) === expectedRuntime) return;
    schemaRevision = values.get(SCHEMA_REVISION_KEY) ?? null;
  } catch (err) {
    // A connection or D1 service error must remain an error. Treating it as a new database could
    // replay migrations against a live pool at exactly the wrong time.
    if (!isMissingMetaTable(err)) throw err;
    // A genuinely empty database has no meta table. Applying the idempotent schema is the one
    // correct slow path; normal production requests never return here once initialization lands.
    metadataAvailable = false;
  }

  if (!metadataAvailable) {
    await applySchema(env.DB);
    appliedSchema = true;
  } else if (schemaRevision !== SCHEMA_REVISION) {
    const canAdoptLegacySchema = schemaRevision === null && await hasCurrentLegacySchema(env.DB);
    if (!canAdoptLegacySchema) {
      await applySchema(env.DB);
      appliedSchema = true;
    }
  }

  if (appliedSchema || schemaRevision !== SCHEMA_REVISION) {
    await setMeta(env.DB, SCHEMA_REVISION_KEY, SCHEMA_REVISION);
  }
  await syncSchedule(env.DB);
  await ensurePool(env.DB, {
    slug: env.POOL_SLUG || "high-five",
    name: env.POOL_NAME || env.POOL_TYPE || "High Five",
    type: env.POOL_TYPE || "High Five",
    season: SEASON,
    now: new Date().toISOString(),
  });
  // Written last: a cold isolate may skip all setup only after every prerequisite succeeded.
  await setMeta(env.DB, RUNTIME_REVISION_KEY, expectedRuntime);
}

/** Seeds/refreshes games from the schedule bundled at build time. */
export async function syncSchedule(db: D1Database, force = false): Promise<{ upserted: number; version: string }> {
  const current = await getMeta(db, "schedule_version");
  if (!force && current === SCHEDULE_VERSION) return { upserted: 0, version: SCHEDULE_VERSION };
  const upserted = await upsertGames(db, SEASON, schedule.games);
  await setMeta(db, "schedule_version", SCHEDULE_VERSION);
  return { upserted, version: SCHEDULE_VERSION };
}

export interface RemoteSyncResult {
  ok: boolean;
  reason?: string;
  fetched: number;
  updated: number;
  syncedAt: string;
}

async function defaultFetchCsv(): Promise<string> {
  const res = await fetch(NFLVERSE_GAMES_CSV, { headers: { "user-agent": "high-five-pool/1.0" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/**
 * Pulls the live nflverse schedule and moves kickoff times that the NFL has flexed.
 * Conservative by design: never deletes, never touches results, never changes week or
 * teams (picks reference those), ignores placeholder times, and refuses to apply a feed
 * that doesn't cover the games we already know about.
 */
export async function syncScheduleFromSource(
  db: D1Database,
  fetchCsv: () => Promise<string> = defaultFetchCsv,
): Promise<RemoteSyncResult> {
  const syncedAt = new Date().toISOString();
  let text: string;
  try {
    text = await fetchCsv();
  } catch (err) {
    const reason = `fetch failed: ${err instanceof Error ? err.message : String(err)}`;
    await setMeta(db, "schedule_sync_error", `${syncedAt} ${reason}`);
    return { ok: false, reason, fetched: 0, updated: 0, syncedAt };
  }
  const fetched = gamesFromCsv(text, SEASON);
  const existing = await listGames(db, SEASON);
  const byId = new Map(existing.map((g) => [g.id, g]));
  const known = fetched.filter((g) => byId.has(g.id));
  if (existing.length === 0 || known.length < Math.ceil(existing.length * 0.95)) {
    const reason = `feed covered ${known.length} of ${existing.length} known games; not applied`;
    await setMeta(db, "schedule_sync_error", `${syncedAt} ${reason}`);
    return { ok: false, reason, fetched: fetched.length, updated: 0, syncedAt };
  }
  const changes = known
    .filter((g) => !g.tbd)
    .filter((g) => {
      const e = byId.get(g.id)!;
      return e.kickoffAt !== g.kickoff || (e.venue ?? null) !== (g.venue ?? null) || e.neutral !== g.neutral;
    })
    .map((g) => ({ id: g.id, kickoff: g.kickoff, venue: g.venue, neutral: g.neutral }));
  if (changes.length) await updateKickoffs(db, changes);
  await setMeta(db, "schedule_synced_at", syncedAt);
  await setMeta(db, "schedule_last_changes", String(changes.length));
  await setMeta(db, "schedule_sync_error", "");
  return { ok: true, fetched: fetched.length, updated: changes.length, syncedAt };
}

export interface ResultSyncResult {
  ok: boolean;
  reason?: string;
  /** Finals written (only games that had no result recorded). */
  applied: number;
  /** Finals the feed agrees with us on. */
  confirmed: number;
  /** Games we consider started that the feed has no final for yet. */
  pending: number;
  /** Games where the feed disagrees with the recorded winner. Never overwritten — yours wins. */
  conflicts: { gameId: string; recorded: string; feed: string; awayScore: number; homeScore: number }[];
  syncedAt: string;
}

/**
 * Fills in results from the nflverse feed for games that have finished.
 *
 * Deliberately timid, because a wrong result silently rewrites the standings: it only writes
 * games with no result recorded, only for games that have already kicked off, only when the
 * feed's teams match ours, and only from a feed that demonstrably covers our schedule. A feed
 * that disagrees with something already recorded is reported, never applied — the commissioner
 * clears the result by hand if the feed is the one that's right.
 */
export async function syncResultsFromSource(
  db: D1Database,
  now: string,
  options: {
    week?: number;
    fetchCsv?: () => Promise<string>;
    /**
     * Ignore a game until this long after kickoff. The feed carries a score only once a game is
     * done, so this is belt and braces — but an unattended run has nobody watching it, and a
     * wrong winner written from a half-finished game would never be corrected on its own: a
     * recorded result is only ever reported as a conflict, never overwritten.
     */
    minElapsedHours?: number;
  } = {},
): Promise<ResultSyncResult> {
  const fetchCsv = options.fetchCsv ?? defaultFetchCsv;
  const syncedAt = new Date().toISOString();
  const empty = { applied: 0, confirmed: 0, pending: 0, conflicts: [], syncedAt };

  const all = await listGames(db, SEASON);
  const scope = all.filter((g) => options.week === undefined || g.week === options.week);
  const ripe = Date.parse(now) - (options.minElapsedHours ?? 0) * 3_600_000;
  const candidates = scope.filter((g) => Date.parse(g.kickoffAt) <= ripe);
  // Nothing has finished that we do not already know about, so do not go and fetch two megabytes
  // to find that out. This is what makes running it every half hour reasonable.
  if (candidates.every((g) => g.winner !== null)) {
    await setMeta(db, "results_synced_at", syncedAt);
    return { ok: true, ...empty, confirmed: candidates.length };
  }

  let text: string;
  try {
    text = await fetchCsv();
  } catch (err) {
    const reason = `fetch failed: ${err instanceof Error ? err.message : String(err)}`;
    await setMeta(db, "results_sync_error", `${syncedAt} ${reason}`);
    return { ok: false, reason, ...empty };
  }

  // Same integrity check as the schedule sync: does this feed actually know our season?
  const ids = new Set(all.map((g) => g.id));
  const covered = gamesFromCsv(text, SEASON).filter((g) => ids.has(g.id)).length;
  if (all.length === 0 || covered < Math.ceil(all.length * 0.95)) {
    const reason = `feed covered ${covered} of ${all.length} known games; not applied`;
    await setMeta(db, "results_sync_error", `${syncedAt} ${reason}`);
    return { ok: false, reason, ...empty };
  }

  const finals = new Map(finalsFromCsv(text, SEASON).map((f) => [f.id, f]));
  const started = candidates;
  const toWrite: { id: string; winner: Winner; awayScore: number; homeScore: number }[] = [];
  const conflicts: ResultSyncResult["conflicts"] = [];
  let confirmed = 0;
  let pending = 0;
  for (const game of started) {
    const f = finals.get(game.id);
    if (!f || f.away !== game.away || f.home !== game.home) {
      pending++;
      continue;
    }
    if (game.winner === null) {
      // f.winner is f.home, f.away or TIE, and those teams just matched this game's.
      toWrite.push({ id: game.id, winner: f.winner as Winner, awayScore: f.awayScore, homeScore: f.homeScore });
    } else if (game.winner === f.winner) {
      confirmed++;
    } else {
      conflicts.push({ gameId: game.id, recorded: game.winner, feed: f.winner, awayScore: f.awayScore, homeScore: f.homeScore });
    }
  }
  if (toWrite.length) await applyResults(db, toWrite, now);
  await setMeta(db, "results_synced_at", syncedAt);
  await setMeta(db, "results_sync_error", "");
  return { ok: true, applied: toWrite.length, confirmed, pending, conflicts, syncedAt };
}

let ready: Promise<void> | null = null;

/**
 * Makes a deployment ready once, then reduces later cold starts to one indexed metadata read.
 * The previous implementation replayed every migration on the first request handled by every new
 * isolate, which could exhaust the browser's request deadline in the middle of a live pick week.
 */
export function ensureReady(env: Env): Promise<void> {
  if (ready && !isDev(env)) return ready;
  const run = prepareRuntime(env);
  ready = run.catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}
