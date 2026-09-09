import schema from "../migrations/0001_init.sql?raw";
import schedule from "../shared/schedule-2026.json";
import { getMeta, setMeta, upsertGames } from "./db.ts";
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

export async function syncSchedule(db: D1Database, force = false): Promise<{ upserted: number; version: string }> {
  const current = await getMeta(db, "schedule_version");
  if (!force && current === SCHEDULE_VERSION) return { upserted: 0, version: SCHEDULE_VERSION };
  const upserted = await upsertGames(db, SEASON, schedule.games);
  await setMeta(db, "schedule_version", SCHEDULE_VERSION);
  return { upserted, version: SCHEDULE_VERSION };
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
