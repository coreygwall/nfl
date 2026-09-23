import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { uniqueName } from "./names.ts";

/**
 * Deleting your account (`DELETE /api/me`, App Store Guideline 5.1.1(v)). Anonymised rather than
 * erased: every way back in goes, the picks stay under "Former player" so nobody else's results
 * move, and nothing can bring the empty row back to life.
 */
const BEFORE = "2026-09-09T12:00:00.000Z";
const name = () => uniqueName("Leaving");

async function api(path: string, options: { token?: string; body?: unknown; method?: string; pin?: string; ip?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", "cf-connecting-ip": options.ip ?? "203.0.113.77" };
  if (options.token) headers["x-player-token"] = options.token;
  if (options.pin) headers["x-admin-pin"] = options.pin;
  const response = await SELF.fetch(`http://pool.test/api${path}?now=${BEFORE}`, {
    headers,
    method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { status: response.status, body: (await response.json()) as any, cookie: response.headers.get("set-cookie") };
}

const PICKS = [
  { gameId: "2026_01_NE_SEA", team: "SEA", rank: 1 },
  { gameId: "2026_01_SF_LA", team: "SF", rank: 2 },
];

async function leaver() {
  const owner = (await api("/players", { body: { name: name() } })).body;
  const child = (await api("/entries", { token: owner.token, body: { name: name() } })).body.player;
  expect((await api("/weeks/1/picks", { token: owner.token, method: "PUT", body: { picks: PICKS } })).status).toBe(200);
  return { owner, child };
}

describe("deleting your account", () => {
  it("needs a signed-in account and an explicit confirmation", async () => {
    expect((await api("/me", { method: "DELETE", body: { confirm: true } })).status).toBe(401);
    const { owner } = await leaver();
    const unconfirmed = await api("/me", { method: "DELETE", token: owner.token, body: {} });
    expect(unconfirmed.status).toBe(400);
    expect(unconfirmed.body.error.code).toBe("CONFIRM_REQUIRED");
    expect((await api("/bootstrap", { token: owner.token })).body.account.id).toBe(owner.player.id);
  });

  it("signs every device out, takes the name and the family, and keeps the picks", async () => {
    const { owner, child } = await leaver();
    const second = await api(`/players/${owner.player.id}/claim`, { body: { code: owner.code } });
    expect(second.status).toBe(200);

    const gone = await api("/me", { method: "DELETE", token: owner.token, body: { confirm: true } });
    expect(gone.status).toBe(200);
    expect(gone.cookie).toContain("Max-Age=0");

    // Both devices are signed out, not just the one that asked.
    for (const token of [owner.token, second.body.token]) {
      expect((await api("/bootstrap", { token })).body.account).toBeFalsy();
    }

    const rows = await env.DB.prepare("SELECT id, name, claim_code, deleted_at FROM players WHERE id IN (?, ?)")
      .bind(owner.player.id, child.id)
      .all<{ id: string; name: string; claim_code: string | null; deleted_at: string | null }>();
    expect(rows.results).toHaveLength(2);
    for (const row of rows.results) {
      expect(row.name).toBe("Former player");
      expect(row.claim_code).toBeNull();
      expect(row.deleted_at).toBe(BEFORE);
    }
    const devices = await env.DB.prepare("SELECT count(*) AS n FROM devices WHERE player_id IN (?, ?)").bind(owner.player.id, child.id).first<{ n: number }>();
    expect(devices?.n).toBe(0);
    const owned = await env.DB.prepare("SELECT count(*) AS n FROM entry_owners WHERE owner_id = ?").bind(owner.player.id).first<{ n: number }>();
    expect(owned?.n).toBe(0);

    // The picks are still there, so last week's results do not move for anybody else.
    const picks = await env.DB.prepare("SELECT count(*) AS n FROM picks WHERE player_id = ?").bind(owner.player.id).first<{ n: number }>();
    expect(picks?.n).toBe(PICKS.length);

    // Off the roster nobody taps, and the name is free for somebody new.
    const roster = (await api("/bootstrap")).body.players;
    expect(roster.some((p: any) => p.id === owner.player.id || p.id === child.id)).toBe(false);
    expect((await api("/players", { body: { name: owner.player.name }, ip: "203.0.113.78" })).status).toBe(201);
  });

  it("cannot be brought back by a claim, an attach, a reset or a rename", async () => {
    const { owner, child } = await leaver();
    expect((await api("/me", { method: "DELETE", token: owner.token, body: { confirm: true } })).status).toBe(200);

    for (const id of [owner.player.id, child.id]) {
      const claim = await api(`/players/${id}/claim`, { body: { code: owner.code } });
      expect(claim.status).toBe(410);
      expect(claim.body.error.code).toBe("DELETED_PLAYER");
      expect((await api(`/commissioner/players/${id}/reset-access`, { body: {}, pin: "1234" })).status).toBe(410);
      expect((await api(`/commissioner/players/${id}`, { method: "PATCH", body: { name: name() }, pin: "1234" })).status).toBe(410);
    }
  });
});
