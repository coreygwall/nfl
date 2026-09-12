import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { MAX_CLAIM_ATTEMPTS } from "../../worker/auth.ts";

const BEFORE = "2026-09-09T12:00:00.000Z";

interface Opts {
  token?: string;
  body?: unknown;
  method?: string;
  now?: string;
  pin?: string;
}

async function api<T = any>(path: string, opts: Opts = {}): Promise<{ status: number; body: T }> {
  const url = new URL(`http://pool.test/api${path}`);
  if (opts.now) url.searchParams.set("now", opts.now);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.token) headers["x-player-token"] = opts.token;
  if (opts.pin) headers["x-admin-pin"] = opts.pin;
  const res = await SELF.fetch(url, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as T };
}

let seq = 0;
async function join(prefix = "Claimer") {
  const name = `${prefix} ${Date.now().toString(36)}${(seq++).toString(36)}`;
  const { status, body } = await api("/players", { body: { name } });
  expect(status).toBe(201);
  return { id: body.player.id as string, name, token: body.token as string, code: body.code as string };
}

describe("claiming a name on another device", () => {
  it("hands the first device a token and a code", async () => {
    const p = await join();
    expect(p.token).toMatch(/^[\w-]{20,}$/);
    expect(p.code).toMatch(/^[A-Z2-9]{8}$/);
    const me = await api("/bootstrap", { token: p.token });
    expect(me.body.me).toMatchObject({ id: p.id, name: p.name });
  });

  it("lets a second device in with the code, and keeps the first one working", async () => {
    const p = await join();
    const second = await api(`/players/${p.id}/claim`, { body: { code: p.code } });
    expect(second.status).toBe(200);
    expect(second.body.token).not.toBe(p.token);

    for (const token of [p.token, second.body.token]) {
      const boot = await api("/bootstrap", { token });
      expect(boot.body.me).toMatchObject({ id: p.id });
    }
  });

  it("accepts the code as it is written down: lower case, with the dash", async () => {
    const p = await join();
    const typed = `${p.code.slice(0, 4)}-${p.code.slice(4)}`.toLowerCase();
    const r = await api(`/players/${p.id}/claim`, { body: { code: typed } });
    expect(r.status).toBe(200);
  });

  it("refuses a wrong code and gives nothing away", async () => {
    const p = await join();
    const wrong = await api(`/players/${p.id}/claim`, { body: { code: "AAAA2222" } });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe("BAD_CODE");
    expect(wrong.body.token).toBeUndefined();
    const missing = await api(`/players/${p.id}/claim`, { body: {} });
    expect(missing.status).toBe(401);
  });

  it("locks out after repeated guessing, and the commissioner can undo it", async () => {
    const p = await join();
    for (let i = 0; i < MAX_CLAIM_ATTEMPTS; i++) {
      const r = await api(`/players/${p.id}/claim`, { body: { code: "AAAA2222" } });
      expect(r.status).toBe(401);
    }
    const locked = await api(`/players/${p.id}/claim`, { body: { code: p.code } });
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe("CLAIM_LOCKED");

    const reset = await api(`/admin/players/${p.id}/reset-access`, { body: {}, pin: "1234" });
    expect(reset.status).toBe(200);
    expect(reset.body.code).not.toBe(p.code);

    // The old token was revoked with the reset, and the new code works immediately.
    const old = await api("/bootstrap", { token: p.token });
    expect(old.body.me).toBeNull();
    const back = await api(`/players/${p.id}/claim`, { body: { code: reset.body.code } });
    expect(back.status).toBe(200);
  });

  it("claims a name that no device holds, so people who joined earlier are not locked out", async () => {
    const p = await join();
    await api(`/admin/players/${p.id}/reset-access`, { body: {}, pin: "1234" });
    // No devices left: the next one in gets the name without a code, and a code for the one after.
    const first = await api(`/players/${p.id}/claim`, { body: {} });
    expect(first.status).toBe(200);
    expect(first.body.code).toMatch(/^[A-Z2-9]{8}$/);
    // Now it is spoken for.
    const second = await api(`/players/${p.id}/claim`, { body: {} });
    expect(second.status).toBe(401);
  });

  it("will not take picks from a device with no token", async () => {
    const p = await join();
    const games = await api("/weeks/1", { now: BEFORE });
    const picks = games.body.games.slice(0, 2).map((g: any, i: number) => ({ gameId: g.id, team: g.home, rank: i + 1 }));

    const anon = await api("/weeks/1/picks", { method: "PUT", body: { picks }, now: BEFORE });
    expect(anon.status).toBe(401);
    const fake = await api("/weeks/1/picks", { method: "PUT", body: { picks }, token: p.id, now: BEFORE });
    expect(fake.status).toBe(401);
    const real = await api("/weeks/1/picks", { method: "PUT", body: { picks }, token: p.token, now: BEFORE });
    expect(real.status).toBe(200);
  });

  it("404s a claim for a name that is not in the pool", async () => {
    const r = await api("/players/not-a-real-id/claim", { body: {} });
    expect(r.status).toBe(404);
  });
});

describe("staying signed in and picking for the family", () => {
  it("sets a session cookie, and that cookie alone is enough to be recognised", async () => {
    const name = `Cookie ${Date.now().toString(36)}`;
    const created = await SELF.fetch("http://pool.test/api/players", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const setCookie = created.headers.get("set-cookie") ?? "";
    expect(setCookie).toMatch(/^hf_device=/);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toMatch(/Max-Age=\d{7,}/); // over a year

    // A browser that lost localStorage still sends the cookie.
    const cookie = setCookie.split(";")[0]!;
    const res = await SELF.fetch("http://pool.test/api/bootstrap", { headers: { cookie } });
    const body = (await res.json()) as any;
    expect(body.me).toMatchObject({ name });
  });

  it("clears the cookie on sign out", async () => {
    const p = await join();
    const res = await SELF.fetch("http://pool.test/api/session", {
      method: "DELETE",
      headers: { "x-player-token": p.token },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("lets the commissioner put someone else's name on their own phone", async () => {
    const son = await join("Son");
    const issued = await api(`/admin/players/${son.id}/device`, { body: {}, pin: "1234" });
    expect(issued.status).toBe(200);
    expect(issued.body.token).not.toBe(son.token);

    // No code was needed, and the son's own device keeps working.
    for (const token of [son.token, issued.body.token]) {
      const boot = await api("/bootstrap", { token });
      expect(boot.body.me).toMatchObject({ id: son.id });
    }
    const admin = await api("/admin/players", { pin: "1234" });
    const row = admin.body.players.find((x: any) => x.id === son.id);
    expect(row).toMatchObject({ devices: 2, adminDevices: 1 });
  });

  it("marks picks made from a commissioner's device in the export", async () => {
    const son = await join("Audit");
    const issued = await api(`/admin/players/${son.id}/device`, { body: {}, pin: "1234" });
    const games = await api("/weeks/3", { now: BEFORE });
    const picks = games.body.games.slice(0, 2).map((g: any, i: number) => ({ gameId: g.id, team: g.home, rank: i + 1 }));
    const saved = await api("/weeks/3/picks", { method: "PUT", body: { picks }, token: issued.body.token, now: BEFORE });
    expect(saved.status).toBe(200);

    const csv = await SELF.fetch("http://pool.test/api/admin/export.csv", { headers: { "x-admin-pin": "1234" } });
    const text = await csv.text();
    expect(text.split("\n")[0]).toContain("entered_by");
    const mine = text.split("\n").filter((l) => l.includes(son.name));
    expect(mine.length).toBe(2);
    for (const line of mine) expect(line.endsWith("commissioner")).toBe(true);
  });

  it("records a player's own picks as their own", async () => {
    const p = await join("Self");
    const games = await api("/weeks/4", { now: BEFORE });
    const picks = [{ gameId: games.body.games[0].id, team: games.body.games[0].home, rank: 1 }];
    await api("/weeks/4/picks", { method: "PUT", body: { picks }, token: p.token, now: BEFORE });
    const csv = await SELF.fetch("http://pool.test/api/admin/export.csv", { headers: { "x-admin-pin": "1234" } });
    const text = await csv.text();
    const line = text.split("\n").find((l) => l.includes(p.name))!;
    expect(line.endsWith("player")).toBe(true);
  });
});
