import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const BEFORE = "2026-09-09T12:00:00.000Z";
let seq = 0;
const name = () => `Family ${Date.now().toString(36)}${seq++}`;
async function api(path: string, options: { token?: string; entry?: string; body?: unknown; method?: string; cookie?: string; pin?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.token) headers["x-player-token"] = options.token;
  if (options.entry) headers["x-entry-id"] = options.entry;
  if (options.cookie) headers.cookie = options.cookie;
  if (options.pin) headers["x-admin-pin"] = options.pin;
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

  it("doesn't offer a fake recovery code, and removes an account's entries together", async () => {
    const { owner, child } = await family();
    const reset = await api(`/commissioner/players/${child.id}/reset-access`, { body: {}, pin: "1234" });
    expect(reset.status).toBe(409);
    expect(reset.body.error.code).toBe("MANAGED_ENTRY");
    expect((await api("/bootstrap", { token: owner.token, entry: child.id })).body.me.id).toBe(child.id);

    expect((await api(`/commissioner/players/${owner.player.id}`, { method: "DELETE", pin: "1234" })).status).toBe(200);
    const roster = (await api("/bootstrap")).body.players;
    expect(roster.some((p: any) => p.id === owner.player.id || p.id === child.id)).toBe(false);
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

describe("attaching a player who already joined on their own", () => {
  it("brings them into the calling commissioner's account, never a third party's, and only once", async () => {
    const independent = (await api("/players", { body: { name: name() } })).body.player;
    // The PIN alone opens the office; attaching still needs an account to attach onto.
    const anonymous = await api(`/commissioner/players/${independent.id}/attach`, { body: {}, pin: "1234" });
    expect(anonymous.status).toBe(401);

    const commissioner = (await api("/players", { body: { name: name() } })).body;
    const attach = await api(`/commissioner/players/${independent.id}/attach`, { body: {}, token: commissioner.token, pin: "1234" });
    expect(attach.status).toBe(200);
    expect(attach.body.ownerId).toBe(commissioner.player.id);

    const boot = (await api("/bootstrap", { token: commissioner.token })).body;
    expect(boot.myEntries.map((p: any) => p.id).sort()).toEqual([commissioner.player.id, independent.id].sort());
    const roster = (await api("/commissioner/players", { pin: "1234" })).body.players;
    expect(roster.find((p: any) => p.id === independent.id).owner).toEqual({ id: commissioner.player.id, name: commissioner.player.name });

    // Nobody attaches their own row, and nobody attaches one that already has an owner — not
    // even the account that already holds it.
    const self = await api(`/commissioner/players/${commissioner.player.id}/attach`, { body: {}, token: commissioner.token, pin: "1234" });
    expect(self.status).toBe(400);
    const again = await api(`/commissioner/players/${independent.id}/attach`, { body: {}, token: commissioner.token, pin: "1234" });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("MANAGED_ENTRY");

    const other = (await api("/players", { body: { name: name() } })).body;
    const stolen = await api(`/commissioner/players/${independent.id}/attach`, { body: {}, token: other.token, pin: "1234" });
    expect(stolen.status).toBe(409);
  });
});
