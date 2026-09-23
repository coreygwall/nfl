import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { demoPicks, runDemo, type DemoPlayer } from "../../worker/demo.ts";
import { ensureReady, SEASON } from "../../worker/ready.ts";
import { listGames } from "../../worker/db.ts";
import { uniqueName } from "./names.ts";

/**
 * The demo pool's made-up players (`worker/demo.ts`). They must fill every week up to the one open
 * now, never do it twice, and never be claimable by a visitor tapping their name. A roster of this
 * file's own is passed in, so none of it lands on the boards the other suites read.
 */
const WEEK3 = "2026-09-24T12:00:00.000Z"; // week 3 is open, weeks 1 and 2 are over

const roster = (): DemoPlayer[] => [
  { name: uniqueName("Demo"), favourites: ["GB"], homeLean: 0.6 },
  { name: uniqueName("Demo"), favourites: ["PHI", "NYG"], homeLean: 0.7 },
  { name: uniqueName("Demo"), favourites: [], homeLean: 0.5 },
];

describe("the demo pool", () => {
  it("gives every demo player five ranked picks for every week so far, once", async () => {
    await ensureReady(env);
    const players = roster();
    const first = await runDemo(env.DB, SEASON, WEEK3, players);
    expect(first.created).toBe(3);
    expect(first.weeksFilled).toBe(9);

    for (const p of players) {
      const row = await env.DB.prepare("SELECT id, claim_requires_code FROM players WHERE name = ?").bind(p.name).first<{ id: string; claim_requires_code: number }>();
      expect(row?.claim_requires_code).toBe(1);
      const weeks = await env.DB.prepare("SELECT week, count(*) AS n FROM picks WHERE player_id = ? GROUP BY week ORDER BY week").bind(row!.id).all<{ week: number; n: number }>();
      expect(weeks.results).toEqual([{ week: 1, n: 5 }, { week: 2, n: 5 }, { week: 3, n: 5 }]);
    }

    const again = await runDemo(env.DB, SEASON, WEEK3, players);
    expect(again).toEqual({ created: 0, weeksFilled: 0 });
  });

  it("puts a demo player's own team first, and the same five every time", async () => {
    await ensureReady(env);
    const games = (await listGames(env.DB, SEASON)).filter((g) => g.week === 1);
    const packers: DemoPlayer = { name: "Packers fan", favourites: ["GB"], homeLean: 0.5 };
    const picks = demoPicks(packers, 1, games);
    expect(picks.map((p) => p.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(picks.map((p) => p.gameId)).size).toBe(5);
    if (games.some((g) => g.home === "GB" || g.away === "GB")) expect(picks[0]!.team).toBe("GB");
    expect(demoPicks(packers, 1, games)).toEqual(picks);
  });

  it("will not hand a demo player to whoever taps the name", async () => {
    await ensureReady(env);
    const players = roster();
    await runDemo(env.DB, SEASON, WEEK3, players);
    const id = (await env.DB.prepare("SELECT id FROM players WHERE name = ?").bind(players[0]!.name).first<{ id: string }>())!.id;
    const claim = await (await import("cloudflare:test")).SELF.fetch(`http://pool.test/api/players/${id}/claim?now=${WEEK3}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(claim.status).toBe(401);
  });
});
