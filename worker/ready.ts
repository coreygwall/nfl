import schema from "../migrations/0001_init.sql?raw";
import schedule from "../shared/schedule-2026.json";
import { gamesFromCsv, NFLVERSE_GAMES_CSV } from "../shared/nflverse.ts";
import { getMeta, listGames, setMeta, updateKickoffs, upsertGames } from "./db.ts";
import { isDev, type Env } from "./env.ts";

export const SEASON = schedule.season;
export const SCHEDULE_VERSION = schedule.version;

const statements = schema
  .split(/;\s*\n/)
  .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
  .filter(Boolean);

async function applySchema(db: D1Database): Promise<void> {
  await db.batch(statements.map((s) => db.prepare(s)));
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

let ready: Promise<void> | null = null;

/** Applies the schema and seeds/refreshes the schedule. Memoised per isolate in production. */
export function ensureReady(env: Env): Promise<void> {
  if (ready && !isDev(env)) return ready;
  const run = (async () => {
    await applySchema(env.DB);
    await syncSchedule(env.DB);
  })();
  ready = run.catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}
