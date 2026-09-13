import { picksDue, segmentSettled, weekDone, type EntryRef, type Notification, type SegmentResult } from "../shared/notify.ts";
import { buildSeasonBoard, buildWeekBoard } from "../shared/scoring.ts";
import { picksInSegment, segmentId, stillToPlay, weekSegments, type Segment } from "../shared/segments.ts";
import type { Abbr } from "../shared/teams.ts";
import type { Game, Player } from "../shared/types.ts";
import { HOUR_MS, ms } from "../shared/week.ts";
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

/** How long before a slate we nudge someone who has not finished picking. */
const NUDGE_LEAD_MS = 2.25 * HOUR_MS;
/** Do not nudge inside this — at that point it is noise, not a favour. */
const NUDGE_FLOOR_MS = 30 * 60 * 1000;
/** Weeks either side of now worth looking at: enough for a Monday night that has just ended. */
const WINDOW_MS = 3 * 24 * HOUR_MS;

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

/** Where a message should open. Tapping a result goes to the board; tapping a nudge goes to picks. */
function pathFor(kind: Notification["kind"], slug: string | undefined, week: number): string {
  const base = slug ? `/p/${slug}` : "";
  return kind === "picksDue" ? `${base}/week/${week}` : `${base}/board/week/${week}`;
}

/** Everything one install should hear about, in entry order. */
function entriesFor(token: PushTokenRecord, owned: Map<string, string[]>): string[] {
  if (token.accountId) {
    // The account's own row picks too, often enough that leaving it out would be the bug.
    return [token.accountId, ...(owned.get(token.accountId) ?? [])];
  }
  return token.playerId ? [token.playerId] : [];
}

interface Plan {
  id: string;
  playerId: string;
  notification: Notification;
}

/** Weeks with something happening near enough to `now` to be worth thinking about. */
function weeksInPlay(games: Game[], now: string): number[] {
  const t = ms(now);
  const weeks = new Set<number>();
  for (const g of games) {
    const k = ms(g.kickoffAt);
    if (Math.abs(k - t) <= WINDOW_MS) weeks.add(g.week);
  }
  return [...weeks].sort((a, b) => a - b);
}

/**
 * The nudges. Two anchors a week: the first game of all, and — because a Thursday reminder has
 * been forgotten by Sunday — the first game of the Sunday slate.
 */
function nudgeAnchors(segments: Segment[]): { id: string; at: string }[] {
  const first = segments[0];
  if (!first) return [];
  const anchors = [{ id: "weekOpen", at: first.firstKickoff }];
  const sunday = segments.find((s) => s.key === "sunEarly");
  if (sunday && sunday.firstKickoff !== first.firstKickoff) anchors.push({ id: "sunday", at: sunday.firstKickoff });
  return anchors;
}

/** Builds every message this moment calls for. Pure, so the rules can be tested without Apple. */
export function planNotifications(input: {
  season: number;
  now: string;
  games: Game[];
  players: Player[];
  picks: { playerId: string; gameId: string; team: Abbr; rank: number; week: number }[];
  /** Accounts to the entries they run, so a message can name which entry it is about. */
  entryCountByPlayer: Map<string, number>;
  slug?: string;
  alreadySent: Set<string>;
}): Plan[] {
  const { season, now, games, players, picks, entryCountByPlayer, slug, alreadySent } = input;
  const t = ms(now);
  const nameById = new Map(players.map((p) => [p.id, p.name]));
  const plans: Plan[] = [];

  const claim = (id: string, playerId: string, notification: Notification) => {
    if (alreadySent.has(id)) return;
    plans.push({ id, playerId, notification });
  };

  const entryRef = (playerId: string): EntryRef => ({
    playerId,
    name: nameById.get(playerId) ?? "Your entry",
    oneOfMany: (entryCountByPlayer.get(playerId) ?? 1) > 1,
  });

  for (const week of weeksInPlay(games, now)) {
    const weekGames = games.filter((g) => g.week === week);
    const segments = weekSegments(weekGames);
    if (segments.length === 0) continue;
    const weekPicks = picks.filter((p) => p.week === week);
    const byPlayer = new Map<string, typeof weekPicks>();
    for (const p of weekPicks) {
      const list = byPlayer.get(p.playerId) ?? [];
      list.push(p);
      byPlayer.set(p.playerId, list);
    }

    // Nudges, for anyone who has not finished picking.
    for (const anchor of nudgeAnchors(segments)) {
      const lead = ms(anchor.at) - t;
      if (lead > NUDGE_LEAD_MS || lead < NUDGE_FLOOR_MS) continue;
      for (const player of players) {
        const made = byPlayer.get(player.id)?.length ?? 0;
        if (made >= 5) continue;
        claim(
          `${season}:${week}:nudge:${anchor.id}:${player.id}`,
          player.id,
          picksDue({
            entry: entryRef(player.id),
            week,
            picksMade: made,
            minutesToKickoff: Math.round(lead / 60000),
            path: pathFor("picksDue", slug, week),
          }),
        );
      }
    }

    // Results. A slate only counts once every game in it has a result.
    const settled = segments.filter((s) => s.settled && ms(s.lastKickoff) <= t);
    const weekOver = weekGames.every((g) => g.winner !== null);
    const needBoard = weekOver || settled.length > 0;
    const board = needBoard ? buildWeekBoard({ week, players, picks: weekPicks, games: weekGames, now }) : null;

    for (const segment of settled) {
      // Once the week is over the wrap-up below says everything these would, and says it better.
      // That matters most on a run that is catching up — a cron outage, or the first run after the
      // key was installed — where reporting each slate in turn would mean four buzzes at once.
      if (weekOver) continue;
      for (const [playerId, theirs] of byPlayer) {
        const inSlate = picksInSegment(theirs, segment);
        if (inSlate.length === 0) continue;
        const results: SegmentResult[] = inSlate.map((p) => {
          const game = segment.games.find((g) => g.id === p.gameId)!;
          return { team: p.team, rank: p.rank, won: game.winner === p.team, tied: game.winner === "TIE" };
        });
        const row = board?.rows.find((r) => r.playerId === playerId);
        claim(
          `${segmentId(season, week, segment.key)}:${playerId}`,
          playerId,
          segmentSettled({
            entry: entryRef(playerId),
            segment,
            results,
            weekPoints: row?.points ?? 0,
            remaining: stillToPlay(theirs, weekGames),
            path: pathFor("segment", slug, week),
          }),
        );
      }
    }

    // The wrap-up, once nothing is left to play.
    if (weekOver && board) {
      const seasonBoard = buildSeasonBoard({ season, players, picks, games, now });
      for (const [playerId, theirs] of byPlayer) {
        if (theirs.length === 0) continue;
        const row = board.rows.find((r) => r.playerId === playerId);
        if (!row) continue;
        const seasonRow = seasonBoard.rows.find((r) => r.playerId === playerId);
        claim(
          `${season}:${week}:weekDone:${playerId}`,
          playerId,
          weekDone({
            entry: entryRef(playerId),
            week,
            points: row.points,
            place: row.place,
            field: board.rows.length,
            season:
              seasonBoard.throughWeek >= seasonBoard.fromWeek && seasonRow
                ? {
                    place: seasonRow.place,
                    points: seasonRow.points,
                    field: seasonBoard.rows.length,
                    fromWeek: seasonBoard.fromWeek,
                  }
                : null,
            path: pathFor("weekDone", slug, week),
          }),
        );
      }
    }
  }
  return plans;
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
