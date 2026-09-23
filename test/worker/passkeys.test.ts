import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { uniqueName } from "./names.ts";

/**
 * The crypto itself is @simplewebauthn's business; what matters here is that the endpoints are
 * shut to anyone who isn't signed in, that challenges are single-use and expire, and that a
 * credential from one host is never accepted on another.
 */
interface Opts {
  token?: string;
  body?: unknown;
  host?: string;
}
async function api<T = any>(path: string, opts: Opts = {}): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.token) headers["x-player-token"] = opts.token;
  const res = await SELF.fetch(`http://${opts.host ?? "pool.test"}/api${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(opts.body ?? {}),
  });
  return { status: res.status, body: (await res.json()) as T };
}

async function join() {
  const name = uniqueName("Passkey");
  const res = await SELF.fetch("http://pool.test/api/players", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const body = (await res.json()) as any;
  return { id: body.player.id as string, name, token: body.token as string };
}

describe("passkeys", () => {
  it("only lets a signed-in device add one", async () => {
    const anon = await api("/passkeys/register/options");
    expect(anon.status).toBe(401);
    expect(anon.body.error.code).toBe("NO_PLAYER");

    const p = await join();
    const ok = await api("/passkeys/register/options", { token: p.token });
    expect(ok.status).toBe(200);
    expect(ok.body.challengeId).toBeTruthy();
    expect(ok.body.options.challenge).toBeTruthy();
  });

  it("builds options for the host that asked, so a passkey is bound to that domain", async () => {
    const p = await join();
    const tally = await api("/passkeys/register/options", { token: p.token, host: "playtally.app" });
    expect(tally.body.options.rp.id).toBe("playtally.app");
    // The credential belongs to the app, not to one pool inside it.
    expect(tally.body.options.rp.name).toBe("Tally");
    // Discoverable, so a new device can offer the account with nothing typed.
    expect(tally.body.options.authenticatorSelection.residentKey).toBe("required");

    const dev = await api("/passkeys/register/options", { token: p.token, host: "nfl.example.workers.dev" });
    expect(dev.body.options.rp.id).toBe("nfl.example.workers.dev");
  });

  it("burns a challenge after one use", async () => {
    const p = await join();
    const { body } = await api("/passkeys/register/options", { token: p.token });
    const attempt = () => api("/passkeys/register", { token: p.token, body: { challengeId: body.challengeId, response: fakeResponse } });
    const fakeResponse = { id: "nope", rawId: "nope", type: "public-key", response: {}, clientExtensionResults: {} };

    // The response is junk either way; the point is the second try cannot even reach verification.
    const first = await attempt();
    expect(first.status).toBe(400);
    const second = await attempt();
    expect(second.body.error.code).toBe("STALE_CHALLENGE");
  });

  it("offers sign-in options to anyone, but refuses an unknown credential", async () => {
    const options = await api("/passkeys/auth/options");
    expect(options.status).toBe(200);
    expect(options.body.options.challenge).toBeTruthy();

    const unknown = await api("/passkeys/auth", {
      body: {
        challengeId: options.body.challengeId,
        response: { id: "not-a-real-credential", rawId: "x", type: "public-key", response: {}, clientExtensionResults: {} },
      },
    });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.code).toBe("UNKNOWN_PASSKEY");
  });

  it("reports how many passkeys an identity has on this host", async () => {
    const p = await join();
    const boot = await SELF.fetch("http://pool.test/api/bootstrap", { headers: { "x-player-token": p.token } });
    expect(((await boot.json()) as any).myPasskeys).toBe(0);
  });

  it("refuses a stale challenge id outright", async () => {
    const p = await join();
    const r = await api("/passkeys/register", { token: p.token, body: { challengeId: crypto.randomUUID(), response: {} } });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("STALE_CHALLENGE");
  });
});
