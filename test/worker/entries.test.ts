import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BEFORE = "2026-09-09T12:00:00.000Z";
let seq = 0;
const name = () => `Family ${Date.now().toString(36)}${seq++}`;
async function api(path: string, options: { token?: string; entry?: string; body?: unknown; method?: string; cookie?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.token) headers["x-player-token"] = options.token;
  if (options.entry) headers["x-entry-id"] = options.entry;
  if (options.cookie) headers.cookie = options.cookie;
  const response = await SELF.fetch(`http://pool.test/api${path}?now=${BEFORE}`, {
    headers, method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { status: response.status, body: await response.json() as any };
}
async function family() {
  const owner = (await api("/players", { body: { name: name() } })).body;
  const child = await api("/entries", { token: owner.token, body: { name: name() } });
  expect(child.status).toBe(201);
  return { owner, child: child.body.player };
}

describe("account-owned entries", () => {
  it("requires sign-in and rejects duplicate or invalid names without claiming existing players", async () => {
    expect((await api("/entries", { body: { name: name() } })).status).toBe(401);
    const { owner, child } = await family();
    expect((await api("/entries", { token: owner.token, body: { name: "x" } })).status).toBe(400);
    expect((await api("/entries", { token: owner.token, body: { name: child.name.toUpperCase() } })).status).toBe(409);
    const other = (await api("/players", { body: { name: name() } })).body;
    expect((await api("/entries", { token: owner.token, body: { name: other.player.name } })).status).toBe(409);
  });

  it("restores the entire family with a fresh account sign-in or just the session cookie", async () => {
    const { owner, child } = await family();
    const second = await api("/entries", { token: owner.token, entry: child.id, body: { name: name() } });
    expect(second.status).toBe(201);
    const recovered = await api(`/players/${owner.player.id}/claim`, { body: { code: owner.code } });
    for (const options of [{ token: recovered.body.token }, { cookie: `hf_device=${owner.token}` }]) {
      const boot = (await api("/bootstrap", options)).body;
      expect(boot.myEntries.map((p: any) => p.id).sort()).toEqual([owner.player.id, child.id, second.body.player.id].sort());
      expect(boot.players.find((p: any) => p.id === child.id).claimed).toBe(true);
    }
    const boot = (await api("/bootstrap", { token: owner.token, entry: child.id })).body;
    expect(boot.me.id).toBe(child.id);
    expect(boot.account.id).toBe(owner.player.id);
    expect(boot.myCode).toBe(owner.code);
    const passkey = await api("/passkeys/register/options", { token: owner.token, entry: child.id, body: {} });
    expect(passkey.body.options.user.name).toBe(owner.player.name);
  });

  it("does not allow public roster IDs or another account to take over a managed entry", async () => {
    const { owner, child } = await family();
    const stranger = (await api("/players", { body: { name: name() } })).body;
    expect((await api(`/players/${child.id}/claim`, { body: {} })).status).toBe(403);
    expect((await api("/bootstrap", { token: stranger.token, entry: child.id })).status).toBe(403);
    expect((await api("/weeks/1/picks", { token: stranger.token, entry: child.id, method: "PUT", body: { picks: [] } })).status).toBe(403);
    expect((await api("/weeks/1/picks", { entry: child.id, method: "PUT", body: { picks: [] } })).status).toBe(401);
    expect((await api("/bootstrap", { token: owner.token, entry: stranger.player.id })).status).toBe(403);
  });

  it("keeps picks separate and preserves normal kickoff locks", async () => {
    const { owner, child } = await family();
    const week = (await api("/weeks/1", { token: owner.token })).body;
    const picks = week.games.slice(0, 5).map((g: any, i: number) => ({ gameId: g.id, team: g.home, rank: 5 - i }));
    expect((await api("/weeks/1/picks", { token: owner.token, entry: child.id, method: "PUT", body: { picks } })).status).toBe(200);
    expect((await api("/weeks/1", { token: owner.token })).body.myPicks).toEqual([]);
    expect((await api("/weeks/1", { token: owner.token, entry: child.id })).body.myPicks).toHaveLength(5);
    const late = await SELF.fetch("http://pool.test/api/weeks/1/picks?now=2026-09-20T12:00:00.000Z", {
      method: "PUT", headers: { "content-type": "application/json", "x-player-token": owner.token, "x-entry-id": child.id },
      body: JSON.stringify({ picks: [] }),
    });
    expect(late.status).toBe(200);
    expect((await late.json() as any).picks).toHaveLength(5);
  });
});
