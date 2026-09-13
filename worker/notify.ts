import type { Notification } from "../shared/notify.ts";
import { planNotifications, WINDOW_MS } from "../shared/notify-plan.ts";
import { ms } from "../shared/week.ts";
import { send, type ApnsConfig, type PushResult } from "./apns.ts";
import {
  claimNotification,
  entriesByOwner,
  listAllPicks,
  listGames,
  listPlayers,
  noteDelivered,
  releaseNotification,
  retirePushToken,
  listPushTokens,
  sentNotificationIds,
  type PushTokenRecord,
} from "./db.ts";

/**
 * Deciding what to say, and to whom.
 *
 * This runs off the same cron that sweeps for finished games, straight after it, so a result that
 * has just landed is already in the database. Every message is claimed in `notifications_sent`
 * before it is sent, which is what lets the sweep run every half hour without anyone's phone
 * buzzing twice for the same slate.
 */

export interface NotifyEnv {
  DB: D1Database;
  POOL_SLUG?: string;
}

export interface DispatchReport {
  /** Messages that were new and got as far as a send. */
  sent: number;
  /** Individual device pushes that Apple accepted. */
  delivered: number;
  /** Tokens Apple told us are dead, now retired. */
  retired: number;
  /** Messages claimed but with nobody reachable, released for a later run. */
  unreachable: number;
  /** Set when there is no APNs key configured, so nothing could be sent. */
  skipped?: string;
}

const EMPTY: DispatchReport = { sent: 0, delivered: 0, retired: 0, unreachable: 0 };

/** Everything one install should hear about, in entry order. */
function entriesFor(token: PushTokenRecord, owned: Map<string, string[]>): string[] {
  if (token.accountId) {
    // The account's own row picks too, often enough that leaving it out would be the bug.
    return [token.accountId, ...(owned.get(token.accountId) ?? [])];
  }
  return token.playerId ? [token.playerId] : [];
}

/** The APNs payload for one message. */
export function payloadFor(n: Notification, week: number): unknown {
  return {
    aps: {
      alert: { title: n.title, body: n.body },
      sound: "default",
      "thread-id": n.threadId,
      "relevance-score": n.kind === "picksDue" ? 1 : 0.5,
      "interruption-level": n.kind === "picksDue" ? "time-sensitive" : "active",
    },
    tally: { kind: n.kind, path: n.path, week },
  };
}

/**
 * Work out what to say, then say it. Claiming each message before the send means two overlapping
 * runs cannot double up; releasing a claim that found no device means a phone that registers an
 * hour later still hears about the slate.
 */
export async function dispatchNotifications(
  env: NotifyEnv,
  season: number,
  now: string,
  config: ApnsConfig | null,
  sender: typeof send = send,
): Promise<DispatchReport> {
  if (!config) return { ...EMPTY, skipped: "no APNs key configured" };

  const [games, players, picks, tokens, owned] = await Promise.all([
    listGames(env.DB, season),
    listPlayers(env.DB),
    listAllPicks(env.DB),
    listPushTokens(env.DB),
    entriesByOwner(env.DB),
  ]);
  if (tokens.length === 0) return { ...EMPTY };

  // Which entries each token covers, and how many entries each person runs.
  const tokensByEntry = new Map<string, PushTokenRecord[]>();
  const entryCountByPlayer = new Map<string, number>();
  for (const token of tokens) {
    const entries = entriesFor(token, owned);
    for (const id of entries) {
      const list = tokensByEntry.get(id) ?? [];
      list.push(token);
      tokensByEntry.set(id, list);
      entryCountByPlayer.set(id, entries.length);
    }
  }

  const weekOf = new Map(games.map((g) => [g.id, g.week]));
  const withWeek = picks.map((p) => ({ ...p, week: weekOf.get(p.gameId) ?? 0 }));

  const since = new Date(ms(now) - WINDOW_MS * 2).toISOString();
  const alreadySent = await sentNotificationIds(env.DB, since);

  const plans = planNotifications({
    season,
    now,
    games,
    players,
    picks: withWeek,
    entryCountByPlayer,
    slug: env.POOL_SLUG,
    alreadySent,
  });

  const report: DispatchReport = { ...EMPTY };
  for (const plan of plans) {
    const targets = tokensByEntry.get(plan.playerId) ?? [];
    if (targets.length === 0) continue;
    if (!(await claimNotification(env.DB, { id: plan.id, kind: plan.notification.kind, playerId: plan.playerId }, now))) {
      continue;
    }
    report.sent += 1;
    const week = Number(plan.id.split(":")[1]) || 0;
    const payload = payloadFor(plan.notification, week);
    let delivered = 0;
    const results = await Promise.all(
      targets.map((token) =>
        sender(config, {
          token: token.token,
          environment: token.environment,
          payload,
          collapseId: plan.id,
          // Nothing here is worth waking someone for tomorrow: if it cannot land within the hour
          // the moment has passed.
          expiration: Math.floor(ms(now) / 1000) + 3600,
        }).then((r): [PushTokenRecord, PushResult] => [token, r]),
      ),
    );
    for (const [token, result] of results) {
      if (result.ok) delivered += 1;
      else if (result.gone) {
        await retirePushToken(env.DB, token.token, now);
        report.retired += 1;
      } else {
        console.warn("apns", result.status, result.reason ?? "");
      }
    }
    report.delivered += delivered;
    if (delivered === 0) {
      // Nobody actually got it. Let a later run try again rather than sitting on a silent failure.
      await releaseNotification(env.DB, plan.id);
      report.sent -= 1;
      report.unreachable += 1;
    } else {
      await noteDelivered(env.DB, plan.id, delivered);
    }
  }
  return report;
}
