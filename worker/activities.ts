import { activityPayload, buildActivityState, picksSettled, staleEpochFor } from "../shared/live-activity.ts";
import { buildWeekBoard } from "../shared/scoring.ts";
import { send, type ApnsConfig, type PushResult } from "./apns.ts";
import {
  endLiveActivity,
  listAllPicks,
  listGames,
  listLiveActivities,
  listPlayers,
  touchLiveActivity,
} from "./db.ts";

/**
 * Keeping the lock screens current.
 *
 * Notifications interrupt; this does not. It runs off the same cron sweep, straight after results
 * land, and rewrites whatever is already on screen — which is the whole reason a Live Activity is
 * worth having on a Sunday. Nobody opens the app between the one o'clock games and the four
 * o'clock ones, and a lock screen that only refreshes when they do is a lock screen showing
 * lunchtime's score at bedtime.
 *
 * Every push is a replacement rather than an event, so there is nothing to claim and nothing to
 * de-duplicate: sending the same state twice is a no-op on the phone. That makes this safe to run
 * as often as the cron fires.
 */

export interface ActivityEnv {
  DB: D1Database;
}

export interface ActivityReport {
  /** Lock screens we pushed a fresh state to. */
  updated: number;
  /** Activities told the week is over, which ends them. */
  ended: number;
  /** Tokens Apple says are dead, now closed off. */
  gone: number;
  skipped?: string;
}

const EMPTY: ActivityReport = { updated: 0, ended: 0, gone: 0 };

/**
 * Apple routes Live Activity pushes to a sub-topic of the bundle id rather than the bundle id
 * itself. Getting it wrong is a 400 with `TopicDisallowed`, which is at least loud.
 */
const ACTIVITY_TOPIC = "push-type.liveactivity";

export async function dispatchActivities(
  env: ActivityEnv,
  season: number,
  now: string,
  config: ApnsConfig | null,
  sender: typeof send = send,
): Promise<ActivityReport> {
  if (!config) return { ...EMPTY, skipped: "no APNs key configured" };

  const activities = await listLiveActivities(env.DB);
  if (activities.length === 0) return { ...EMPTY };

  const [games, players, picks] = await Promise.all([
    listGames(env.DB, season),
    listPlayers(env.DB),
    listAllPicks(env.DB),
  ]);

  // One board per week rather than one per activity: a household with three entries in the same
  // week would otherwise score the same slate three times.
  const boards = new Map<number, ReturnType<typeof buildWeekBoard>>();
  const report = { ...EMPTY };

  for (const activity of activities) {
    const weekGames = games.filter((g) => g.week === activity.week);
    const mine = picks.filter((p) => p.playerId === activity.playerId && weekGames.some((g) => g.id === p.gameId));

    let board = boards.get(activity.week);
    if (!board) {
      board = buildWeekBoard({ week: activity.week, players, picks, games, now });
      boards.set(activity.week, board);
    }
    const row = board.rows.find((r) => r.playerId === activity.playerId);

    const state = buildActivityState({
      picks: mine.map((p) => ({ gameId: p.gameId, team: p.team, rank: p.rank })),
      games: weekGames,
      now,
      place: row?.place ?? null,
      field: row ? board.rows.length : null,
    });

    // The week being over is the only thing that ends an activity — not this entry's five being
    // settled, which happens hours earlier and while their position is still moving.
    const event = state.weekFinal ? "end" : "update";
    const result = await sender(config, {
      token: activity.token,
      environment: activity.environment,
      pushType: "liveactivity",
      topicSuffix: ACTIVITY_TOPIC,
      // A settled slate is worth waking the phone for; a routine refresh is not.
      priority: state.weekFinal || picksSettled(state) ? 10 : 5,
      collapseId: `activity:${activity.playerId}:${activity.week}`,
      payload: activityPayload({
        state,
        now,
        event,
        staleEpoch: event === "update" ? staleEpochFor(state, now) : undefined,
      }),
    });

    await record(env, activity.token, event, result, now, report);
  }

  return report;
}

async function record(
  env: ActivityEnv,
  token: string,
  event: "update" | "end",
  result: PushResult,
  now: string,
  report: ActivityReport,
): Promise<void> {
  if (result.gone) {
    // The app was deleted, or the activity was dismissed and the token retired. Either way there
    // is no lock screen on the other end and there never will be again for this token.
    await endLiveActivity(env.DB, token, now);
    report.gone += 1;
    return;
  }
  if (!result.ok) return;
  if (event === "end") {
    await endLiveActivity(env.DB, token, now);
    report.ended += 1;
    return;
  }
  await touchLiveActivity(env.DB, token, now);
  report.updated += 1;
}
