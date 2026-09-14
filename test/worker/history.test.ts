import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

/**
 * The promise this table makes: picks survive the thing most likely to destroy them, which is
 * not the database failing — it is someone being removed from the roster.
 */
const BEFORE = "2026-09-09T12:00:00.000Z";
const json = { "content-type": "application/json" };

async function join(name: string, ip: string) {
  const res = await SELF.fetch("http://pool.test/api/players", {
    method: "POST",
    headers: { ...json, "cf-connecting-ip": ip },
    body: JSON.stringify({ name }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { player: { id: string; name: string }; token: string };
}

describe("picks are never really gone", () => {
  it("keeps a copy that outlives the player being removed", async () => {
    const me = await join("Vanisher", "203.0.113.40");
    const week = (await (await SELF.fetch(`http://pool.test/api/weeks/1?now=${BEFORE}`)).json()) as {
      games: { id: string; away: string; home: string }[];
    };
    const picks = week.games.slice(0, 5).map((g, i) => ({ gameId: g.id, team: g.away, rank: i + 1 }));
    const put = await SELF.fetch(`http://pool.test/api/weeks/1/picks?now=${BEFORE}`, {
      method: "PUT",
      headers: { ...json, "x-player-token": me.token },
      body: JSON.stringify({ picks }),
    });
    expect(put.status).toBe(200);

    // The commissioner removes them — picks and all.
    const del = await SELF.fetch(`http://pool.test/api/commissioner/players/${me.player.id}`, {
      method: "DELETE",
      headers: { "x-admin-pin": "1234" },
    });
    expect(del.status).toBe(200);
    const left = await env.DB.prepare("SELECT count(*) AS n FROM picks WHERE player_id = ?")
      .bind(me.player.id)
      .first<{ n: number }>();
    expect(left?.n).toBe(0);

    // But the history still has every one of them, under a name still readable.
    const res = await SELF.fetch("http://pool.test/api/commissioner/pick-history?name=Vanisher&week=1", {
      headers: { "x-admin-pin": "1234" },
    });
    expect(res.status).toBe(200);
    const { saves } = (await res.json()) as { saves: { gameId: string; team: string; rank: number; playerName: string }[] };
    expect(saves).toHaveLength(5);
    expect(saves.map((s) => s.rank).sort()).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(saves.map((s) => s.gameId))).toEqual(new Set(picks.map((p) => p.gameId)));
    expect(saves[0]!.playerName).toBe("Vanisher");
  });

  it("records every save, so an overwrite can be walked back too", async () => {
    const me = await join("Changer", "203.0.113.41");
    const week = (await (await SELF.fetch(`http://pool.test/api/weeks/1?now=${BEFORE}`)).json()) as {
      games: { id: string; away: string; home: string }[];
    };
    const save = (teams: "away" | "home") =>
      SELF.fetch(`http://pool.test/api/weeks/1/picks?now=${BEFORE}`, {
        method: "PUT",
        headers: { ...json, "x-player-token": me.token },
        body: JSON.stringify({
          picks: week.games.slice(0, 5).map((g, i) => ({ gameId: g.id, team: g[teams], rank: i + 1 })),
        }),
      });
    expect((await save("away")).status).toBe(200);
    expect((await save("home")).status).toBe(200);

    const res = await SELF.fetch("http://pool.test/api/commissioner/pick-history?name=Changer&week=1", {
      headers: { "x-admin-pin": "1234" },
    });
    const { saves } = (await res.json()) as { saves: { team: string }[] };
    // Both sets are there — the one showing on the board, and the one it replaced.
    expect(saves).toHaveLength(10);
    const teams = new Set(saves.map((s) => s.team));
    expect(teams.size).toBeGreaterThan(1);
  });
});
