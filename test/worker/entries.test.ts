import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { MAX_CLAIM_ATTEMPTS } from "../../worker/auth.ts";
import { uniqueName } from "./names.ts";

const BEFORE = "2026-09-09T12:00:00.000Z";
const name = () => uniqueName("Family");
async function api(path: string, options: { token?: string; entry?: string; body?: unknown; method?: string; cookie?: string; pin?: string; ip?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.token) headers["x-player-token"] = options.token;
  if (options.entry) headers["x-entry-id"] = options.entry;
  if (options.cookie) headers.cookie = options.cookie;
  if (options.pin) headers["x-admin-pin"] = options.pin;
  // Signups are counted per caller, and this file's older tests all share the default address —
  // a new describe block that joins several people of its own needs its own, or it eats into a
  // budget the rest of the suite is quietly relying on staying low.
  if (options.ip) headers["cf-connecting-ip"] = options.ip;
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

describe("what a family phone can see on the board", () => {
  /**
   * The rule the board used to have — the requester's picks and nobody else's — made one phone
   * picking for three people blind to two of them until kickoff. Every entry the account owns is
   * revealed to it now, and marked `mine`, whichever of them the request was made as.
   */
  it("reveals every entry the account owns before kickoff, and only to that account", async () => {
    const { owner, child } = await family();
    const stranger = (await api("/players", { body: { name: name() } })).body;
    // Week 1's opener is NE @ SEA; nothing has started at BEFORE. Three different picks on it.
    const put = (token: string, entry: string | undefined, team: string) =>
      api("/weeks/1/picks", { token, entry, method: "PUT", body: { picks: [{ gameId: "2026_01_NE_SEA", team, rank: 1 }] } });
    expect((await put(owner.token, undefined, "SEA")).status).toBe(200);
    expect((await put(owner.token, child.id, "NE")).status).toBe(200);
    expect((await put(stranger.token, undefined, "SEA")).status).toBe(200);

    // Asked as the child: the child is `isMe`, the owner is still `mine`, and both picks show.
    const asChild = await api("/board/week/1", { token: owner.token, entry: child.id });
    expect(asChild.status).toBe(200);
    const rows = new Map<string, any>(asChild.body.rows.map((r: any) => [r.playerId, r]));
    expect(rows.get(child.id)).toMatchObject({ isMe: true, mine: true });
    expect(rows.get(child.id).picks.map((p: any) => p.team)).toEqual(["NE"]);
    expect(rows.get(owner.player.id)).toMatchObject({ isMe: false, mine: true });
    expect(rows.get(owner.player.id).picks.map((p: any) => p.team)).toEqual(["SEA"]);
    // The stranger's pick is a rank and a lock, and the team is nowhere in the answer.
    expect(rows.get(stranger.player.id)).toMatchObject({ isMe: false, mine: false, picks: [], hiddenRanks: [1] });

    // And the stranger, looking back, sees nothing of the family's.
    const asStranger = await api("/board/week/1", { token: stranger.token });
    const theirs = new Map<string, any>(asStranger.body.rows.map((r: any) => [r.playerId, r]));
    expect(theirs.get(owner.player.id)).toMatchObject({ mine: false, picks: [], hiddenRanks: [1] });
    expect(theirs.get(child.id)).toMatchObject({ mine: false, picks: [], hiddenRanks: [1] });
    expect(theirs.get(stranger.player.id)).toMatchObject({ isMe: true, mine: true });

    // Signed out, the board is all locks and nobody's.
    const anonymous = await api("/board/week/1");
    expect(anonymous.body.rows.every((r: any) => !r.mine && !r.isMe && r.picks.length === 0)).toBe(true);
  });
});

describe("attaching a player who already joined on their own", () => {
  it("brings them into the calling commissioner's account, never a third party's, and only once", async () => {
    const independent = (await api("/players", { body: { name: name() }, ip: "10.0.9.1" })).body.player;
    // The PIN alone opens the office; attaching still needs an account to attach onto.
    const anonymous = await api(`/commissioner/players/${independent.id}/attach`, { body: {}, pin: "1234" });
    expect(anonymous.status).toBe(401);

    const commissioner = (await api("/players", { body: { name: name() }, ip: "10.0.9.1" })).body;
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

    const other = (await api("/players", { body: { name: name() }, ip: "10.0.9.1" })).body;
    const stolen = await api(`/commissioner/players/${independent.id}/attach`, { body: {}, token: other.token, pin: "1234" });
    expect(stolen.status).toBe(409);
  });
});

describe("attaching that same kind of player without a commissioner", () => {
  it("takes any signed-in account's word for it, on the strength of the same code a fresh device would need", async () => {
    const joined = (await api("/players", { body: { name: name() }, ip: "10.0.9.2" })).body;
    const parent = (await api("/players", { body: { name: name() }, ip: "10.0.9.2" })).body;

    // Not signed in: there is nobody to attach onto.
    expect((await api("/entries/attach", { body: { name: joined.player.name, code: joined.code } })).status).toBe(401);
    // The right name, the wrong code.
    const wrong = await api("/entries/attach", { token: parent.token, body: { name: joined.player.name, code: "AAAA-2222" } });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe("BAD_CODE");

    const attach = await api("/entries/attach", { token: parent.token, body: { name: joined.player.name, code: joined.code } });
    expect(attach.status).toBe(200);
    expect(attach.body.ownerId).toBe(parent.player.id);
    const boot = (await api("/bootstrap", { token: parent.token })).body;
    expect(boot.myEntries.map((p: any) => p.id).sort()).toEqual([parent.player.id, joined.player.id].sort());

    // Nobody attaches their own row, and a second account cannot take it once it is spoken for —
    // not even with the right code, since the code no longer proves anything once there is an
    // owner to ask instead.
    expect((await api("/entries/attach", { token: parent.token, body: { name: parent.player.name, code: "AAAA-2222" } })).status).toBe(400);
    const again = await api("/entries/attach", { token: parent.token, body: { name: joined.player.name, code: joined.code } });
    expect(again.status).toBe(409);
    const other = (await api("/players", { body: { name: name() }, ip: "10.0.9.2" })).body;
    const stolen = await api("/entries/attach", { token: other.token, body: { name: joined.player.name, code: joined.code } });
    expect(stolen.status).toBe(409);
  });

  it("locks out repeated guesses the same way a fresh device claim does", async () => {
    const joined = (await api("/players", { body: { name: name() }, ip: "10.0.9.3" })).body;
    const parent = (await api("/players", { body: { name: name() }, ip: "10.0.9.3" })).body;
    for (let i = 0; i < MAX_CLAIM_ATTEMPTS; i++) {
      expect((await api("/entries/attach", { token: parent.token, body: { name: joined.player.name, code: "AAAA-2222" } })).status).toBe(401);
    }
    const locked = await api("/entries/attach", { token: parent.token, body: { name: joined.player.name, code: joined.code } });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe("CLAIM_LOCKED");
  });

  it("sends a name with no code yet to the commissioner instead of a dead end", async () => {
    // The shape production actually has: a name that predates codes, already with a device, that
    // nothing here can hand a fresh code to on its own.
    const id = crypto.randomUUID();
    const legacyName = `Legacy ${id.slice(0, 8)}`;
    await env.DB.prepare("INSERT INTO players (id, name, name_key, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)")
      .bind(id, legacyName, legacyName.toLowerCase(), BEFORE, BEFORE)
      .run();
    const parent = (await api("/players", { body: { name: name() }, ip: "10.0.9.4" })).body;
    const attempt = await api("/entries/attach", { token: parent.token, body: { name: legacyName, code: "AAAA-2222" } });
    expect(attempt.status).toBe(409);
    expect(attempt.body.error.code).toBe("NO_CODE");

    // The commissioner's override needs no code at all.
    const rescue = await api(`/commissioner/players/${id}/attach`, { body: {}, token: parent.token, pin: "1234" });
    expect(rescue.status).toBe(200);
  });
});

/**
 * Changing a name you are responsible for.
 *
 * The account page listed your name and every entry you manage and let you edit none of them, so
 * a typo in your own name was an errand for whoever runs the pool. The route is the commissioner's
 * rename without the office, and the interesting cases are all about *whose* name it is.
 */
describe("renaming yourself and the entries you manage", () => {
  const rename = (id: string, body: unknown, token?: string) =>
    api(`/players/${id}/name`, { method: "PATCH", token, body });

  it("renames the account's own name and the board follows", async () => {
    const { owner } = await family();
    const fresh = name();
    const r = await rename(owner.player.id, { name: fresh }, owner.token);
    expect(r.status).toBe(200);
    expect(r.body.player.name).toBe(fresh);
    const boot = (await api("/bootstrap", { token: owner.token })).body;
    expect(boot.account.name).toBe(fresh);
    expect(boot.players.find((p: any) => p.id === owner.player.id).name).toBe(fresh);
  });

  it("renames a managed entry, which is the typo people actually make", async () => {
    const { owner, child } = await family();
    const fresh = name();
    expect((await rename(child.id, { name: fresh }, owner.token)).status).toBe(200);
    const boot = (await api("/bootstrap", { token: owner.token })).body;
    expect(boot.myEntries.find((p: any) => p.id === child.id).name).toBe(fresh);
  });

  it("is nobody else's name to change, signed in or not", async () => {
    const { owner, child } = await family();
    const stranger = (await api("/players", { body: { name: name() } })).body;
    expect((await rename(owner.player.id, { name: name() })).status).toBe(401);
    expect((await rename(owner.player.id, { name: name() }, stranger.token)).status).toBe(403);
    expect((await rename(child.id, { name: name() }, stranger.token)).status).toBe(403);
    // And the name really did not move.
    const boot = (await api("/bootstrap", { token: owner.token })).body;
    expect(boot.account.name).toBe(owner.player.name);
  });

  it("refuses a name somebody else is already using, and a name that is not one", async () => {
    const { owner, child } = await family();
    const other = (await api("/players", { body: { name: name() } })).body;
    expect((await rename(owner.player.id, { name: other.player.name }, owner.token)).status).toBe(409);
    expect((await rename(owner.player.id, { name: child.name.toUpperCase() }, owner.token)).status).toBe(409);
    expect((await rename(owner.player.id, { name: "x" }, owner.token)).status).toBe(400);
    expect((await rename(owner.player.id, { name: "shit" }, owner.token)).status).toBe(400);
  });

  it("lets a name be re-cased or re-spaced without colliding with itself", async () => {
    const { owner } = await family();
    const r = await rename(owner.player.id, { name: owner.player.name.toUpperCase() }, owner.token);
    expect(r.status).toBe(200);
    expect(r.body.player.name).toBe(owner.player.name.toUpperCase());
  });

  it("refuses a player that does not exist", async () => {
    const { owner } = await family();
    expect((await rename("nope", { name: name() }, owner.token)).status).toBe(404);
  });
});
