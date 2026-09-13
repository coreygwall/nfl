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

describe("pulling on a schedule, with nobody watching", () => {
  it("holds a game back until it has had time to finish", async () => {
    await ensureReady(env);
    // A week no other test in this file has touched: the database is shared between them.
    const g = schedule.games.find((x) => x.week === 9)!;
    // Two hours in, a score in the feed is not yet trustworthy on an unattended run.
    const kickoff = Date.parse(g.kickoff);
    let fetched = 0;
    const midGame = await syncResultsFromSource(env.DB, new Date(kickoff + 2 * 3_600_000).toISOString(), {
      week: 9,
      minElapsedHours: 3.5,
      fetchCsv: async () => {
        fetched++;
        return feed({ [g.id]: [21, 17] });
      },
    });
    expect(midGame.applied).toBe(0);
    // And it did not even ask: nothing had finished, so there was nothing to look up.
    expect(fetched).toBe(0);
    expect((await getGame(env.DB, g.id))!.winner).toBeNull();

    // Four hours in, the same feed is accepted.
    const after = await syncResultsFromSource(env.DB, new Date(kickoff + 4 * 3_600_000).toISOString(), {
      week: 9,
      minElapsedHours: 3.5,
      fetchCsv: async () => feed({ [g.id]: [21, 17] }),
    });
    expect(after.applied).toBeGreaterThanOrEqual(1);
    expect((await getGame(env.DB, g.id))!.winner).toBe(g.away);
  });

  it("skips the download entirely once everything finished is already recorded", async () => {
    await ensureReady(env);
    let fetched = 0;
    const counting = async () => {
      fetched++;
      return feed(Object.fromEntries(week1.map((g) => [g.id, [3, 7] as [number, number]])));
    };
    // First run fills in whatever is still blank and does fetch.
    await syncResultsFromSource(env.DB, AFTER_WEEK_1, { fetchCsv: counting });
    expect(fetched).toBe(1);
    // Second run has nothing left to learn, so it never leaves the database.
    const again = await syncResultsFromSource(env.DB, AFTER_WEEK_1, { fetchCsv: counting });
    expect(fetched).toBe(1);
    expect(again.ok).toBe(true);
    expect(again.applied).toBe(0);
  });
});
