import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ensureReady, syncResultsFromSource } from "../../worker/ready.ts";
import { getGame, getMeta, setResult } from "../../worker/db.ts";
import schedule from "../../shared/schedule-2026.json";
import type { Winner } from "../../shared/types.ts";

const HEADER =
  "game_id,season,game_type,week,gameday,weekday,gametime,away_team,away_score,home_team,home_score,location,stadium,result";

/** A feed row per bundled game, with final scores only for the ids passed in. */
function feed(scores: Record<string, [number, number]> = {}, drop: string[] = []): string {
  const lines = [HEADER];
  for (const g of schedule.games) {
    if (drop.includes(g.id)) continue;
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(new Date(g.kickoff));
    const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    const s = scores[g.id];
    lines.push(
      [
        g.id,
        2026,
        "REG",
        g.week,
        `${v.year}-${v.month}-${v.day}`,
        "x",
        `${v.hour}:${v.minute}`,
        g.away,
        s ? s[0] : "",
        g.home,
        s ? s[1] : "",
        g.neutral ? "Neutral" : "Home",
        `"${g.venue ?? ""}"`,
        s ? s[1] - s[0] : "",
      ].join(","),
    );
  }
  return lines.join("\n");
}

// D1 state carries across the tests in this file, so each one works on its own game.
const week1 = schedule.games.filter((g) => g.week === 1);
const AFTER_WEEK_1 = "2026-09-16T12:00:00.000Z";
const BEFORE_KICKOFF = "2026-09-09T12:00:00.000Z";

describe("pulling final scores", () => {
  it("fills in blanks, records the score, and counts what it left alone", async () => {
    await ensureReady(env);
    const [a, b] = week1 as [(typeof week1)[0], (typeof week1)[0]];
    const r = await syncResultsFromSource(env.DB, AFTER_WEEK_1, {
      fetchCsv: async () => feed({ [a.id]: [10, 13], [b.id]: [27, 7] }),
    });

    expect(r.ok).toBe(true);
    expect(r.applied).toBe(2);
    expect(r.confirmed).toBe(0);
    // Every other week-1 game has kicked off but has no final in the feed yet.
    expect(r.pending).toBe(week1.length - 2);
    expect(r.conflicts).toEqual([]);

    const home = (await getGame(env.DB, a.id))!;
    expect(home.winner).toBe(a.home);
    expect(home.awayScore).toBe(10);
    expect(home.homeScore).toBe(13);
    expect((await getGame(env.DB, b.id))!.winner).toBe(b.away);
    expect(await getMeta(env.DB, "results_synced_at")).toBe(r.syncedAt);
  });

  it("scores an equal game as a tie", async () => {
    await ensureReady(env);
    const g = week1[2]!;
    await syncResultsFromSource(env.DB, AFTER_WEEK_1, { fetchCsv: async () => feed({ [g.id]: [20, 20] }) });
    expect((await getGame(env.DB, g.id))!.winner).toBe("TIE");
  });

  it("never overwrites a result the commissioner entered, and reports the disagreement", async () => {
    await ensureReady(env);
    const g = week1[3]!;
    await setResult(env.DB, g.id, g.away as Winner, 3, 0, AFTER_WEEK_1);

    const r = await syncResultsFromSource(env.DB, AFTER_WEEK_1, { fetchCsv: async () => feed({ [g.id]: [10, 13] }) });

    expect(r.applied).toBe(0);
    expect(r.conflicts).toEqual([{ gameId: g.id, recorded: g.away, feed: g.home, awayScore: 10, homeScore: 13 }]);
    const after = (await getGame(env.DB, g.id))!;
    expect(after.winner).toBe(g.away);
    expect(after.awayScore).toBe(3);
  });

  it("counts a result it agrees with as confirmed", async () => {
    await ensureReady(env);
    const g = week1[4]!;
    await setResult(env.DB, g.id, g.home as Winner, 10, 13, AFTER_WEEK_1);
    const r = await syncResultsFromSource(env.DB, AFTER_WEEK_1, { fetchCsv: async () => feed({ [g.id]: [10, 13] }) });
    expect(r).toMatchObject({ ok: true, applied: 0, confirmed: 1, conflicts: [] });
  });

  it("ignores a score for a game that has not kicked off", async () => {
    await ensureReady(env);
    const g = week1[5]!;
    const r = await syncResultsFromSource(env.DB, BEFORE_KICKOFF, { fetchCsv: async () => feed({ [g.id]: [10, 13] }) });
    expect(r).toMatchObject({ ok: true, applied: 0, pending: 0 });
    expect((await getGame(env.DB, g.id))!.winner).toBeNull();
  });

  it("stays inside the week it was given", async () => {
    await ensureReady(env);
    const g = week1[6]!;
    const r = await syncResultsFromSource(env.DB, AFTER_WEEK_1, {
      week: 2,
      fetchCsv: async () => feed({ [g.id]: [10, 13] }),
    });
    expect(r).toMatchObject({ ok: true, applied: 0, pending: 0 });
    expect((await getGame(env.DB, g.id))!.winner).toBeNull();
  });

  it("refuses a feed that does not cover the schedule", async () => {
    await ensureReady(env);
    const g = week1[7]!;
    const drop = schedule.games.slice(20, 60).map((x) => x.id);
    const r = await syncResultsFromSource(env.DB, AFTER_WEEK_1, {
      fetchCsv: async () => feed({ [g.id]: [10, 13] }, drop),
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/covered \d+ of 272 known games/);
    expect((await getGame(env.DB, g.id))!.winner).toBeNull();
    expect(await getMeta(env.DB, "results_sync_error")).toContain("not applied");
  });

  it("survives the feed being down", async () => {
    await ensureReady(env);
    const r = await syncResultsFromSource(env.DB, AFTER_WEEK_1, {
      fetchCsv: async () => {
        throw new Error("network down");
      },
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("network down");
    expect(await getMeta(env.DB, "results_sync_error")).toContain("network down");
  });
});
