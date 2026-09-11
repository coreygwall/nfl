import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { ensureReady, syncScheduleFromSource } from "../../worker/ready.ts";
import { getGame, getMeta, setResult } from "../../worker/db.ts";
import schedule from "../../shared/schedule-2026.json";

const HEADER = "game_id,season,game_type,week,gameday,weekday,gametime,away_team,home_team,location,stadium";
function feed(overrides: Record<string, { gameday?: string; gametime?: string; stadium?: string }> = {}, drop: string[] = []): string {
  const lines = [HEADER];
  for (const g of schedule.games) {
    if (drop.includes(g.id)) continue;
    const o = overrides[g.id] ?? {};
    // Reconstruct an Eastern-time row from the bundled UTC kickoff.
    const et = new Date(g.kickoff);
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(et);
    const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    const gameday = o.gameday ?? `${v.year}-${v.month}-${v.day}`;
    const gametime = o.gametime ?? `${v.hour}:${v.minute}`;
    const stadium = o.stadium ?? g.venue ?? "";
    lines.push([g.id, 2026, "REG", g.week, gameday, "x", gametime, g.away, g.home, g.neutral ? "Neutral" : "Home", `"${stadium}"`].join(","));
  }
  return lines.join("\n");
}

describe("remote schedule sync", () => {
  it("moves a flexed kickoff, leaves results alone, and records when it ran", async () => {
    await ensureReady(env);
    const id = "2026_15_SEA_PHI";
    await setResult(env.DB, "2026_01_NE_SEA", "SEA", null, null, "2026-09-10T04:00:00.000Z");
    const before = (await getGame(env.DB, id))!;
    // Flexed from Saturday 5pm ET to Sunday night 8:20pm ET.
    const r = await syncScheduleFromSource(env.DB, async () => feed({ [id]: { gameday: "2026-12-20", gametime: "20:20" } }));
    expect(r).toMatchObject({ ok: true, updated: 1, fetched: 272 });
    const after = (await getGame(env.DB, id))!;
    expect(before.kickoffAt).toBe("2026-12-19T22:00:00.000Z");
    expect(after.kickoffAt).toBe("2026-12-21T01:20:00.000Z");
    expect(after.week).toBe(before.week);
    expect((await getGame(env.DB, "2026_01_NE_SEA"))!.winner).toBe("SEA");
    expect(await getMeta(env.DB, "schedule_synced_at")).toBe(r.syncedAt);
    expect(await getMeta(env.DB, "schedule_last_changes")).toBe("1");
    // Second run: nothing to do.
    const again = await syncScheduleFromSource(env.DB, async () => feed({ [id]: { gameday: "2026-12-20", gametime: "20:20" } }));
    expect(again).toMatchObject({ ok: true, updated: 0 });
  });

  it("does not overwrite a real kickoff with a placeholder when the feed has no time yet", async () => {
    await ensureReady(env);
    const id = "2026_17_PHI_SF";
    const before = (await getGame(env.DB, id))!;
    const r = await syncScheduleFromSource(env.DB, async () => feed({ [id]: { gametime: "" } }));
    expect(r.ok).toBe(true);
    expect((await getGame(env.DB, id))!.kickoffAt).toBe(before.kickoffAt);
  });

  it("refuses a feed that is missing most of the season", async () => {
    await ensureReady(env);
    const drop = schedule.games.slice(0, 40).map((g) => g.id);
    const r = await syncScheduleFromSource(env.DB, async () => feed({}, drop));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/covered 232 of 272/);
    expect(await getMeta(env.DB, "schedule_sync_error")).toMatch(/not applied/);
  });

  it("survives the feed being down", async () => {
    await ensureReady(env);
    const r = await syncScheduleFromSource(env.DB, async () => {
      throw new Error("HTTP 503");
    });
    expect(r).toMatchObject({ ok: false, updated: 0 });
    expect(r.reason).toMatch(/503/);
  });
});
