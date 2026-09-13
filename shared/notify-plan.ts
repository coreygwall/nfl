import { picksDue, segmentSettled, weekDone, type EntryRef, type Notification, type SegmentResult } from "./notify.ts";
import { buildSeasonBoard, buildWeekBoard } from "./scoring.ts";
import { picksInSegment, segmentId, stillToPlay, weekSegments, type Segment } from "./segments.ts";
import type { Abbr } from "./teams.ts";
import type { Game, Player } from "./types.ts";
import { HOUR_MS, ms } from "./week.ts";

/**
 * What to say, and when — the rules, with nothing in them that knows about Apple or a database.
 *
 * The worker calls this on every cron firing and sends whatever comes back that it has not sent
 * before. Keeping it pure is what makes the awkward cases testable: a week that settles all at
 * once, a nudge that should not fire twice, an entry with a pick in only one slate.
 */

export interface NotificationPlan {
  /** Unique per entry per thing-that-happened, which is what stops a repeat. */
  id: string;
  playerId: string;
  notification: Notification;
}

/** A pick, with the week it belongs to resolved from its game. */
export interface WeekPick {
  playerId: string;
  gameId: string;
  team: Abbr;
  rank: number;
  week: number;
}

/** How long before a slate we nudge someone who has not finished picking. */
const NUDGE_LEAD_MS = 2.25 * HOUR_MS;
/** Do not nudge inside this — at that point it is noise, not a favour. */
const NUDGE_FLOOR_MS = 30 * 60 * 1000;
/** Weeks either side of now worth looking at: enough for a Monday night that has just ended. */
export const WINDOW_MS = 3 * 24 * HOUR_MS;

/** Where a message should open. Tapping a result goes to the board; tapping a nudge goes to picks. */
function pathFor(kind: Notification["kind"], slug: string | undefined, week: number): string {
  const base = slug ? `/p/${slug}` : "";
  return kind === "picksDue" ? `${base}/week/${week}` : `${base}/board/week/${week}`;
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
  picks: WeekPick[];
  /** Accounts to the entries they run, so a message can name which entry it is about. */
  entryCountByPlayer: Map<string, number>;
  slug?: string;
  alreadySent: Set<string>;
}): NotificationPlan[] {
  const { season, now, games, players, picks, entryCountByPlayer, slug, alreadySent } = input;
  const t = ms(now);
  const nameById = new Map(players.map((p) => [p.id, p.name]));
  const plans: NotificationPlan[] = [];

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

