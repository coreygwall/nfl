import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

/**
 * The pool's URL is meant to be shared widely, so the two things a stranger could poke at — the
 * admin PIN and entry creation — are the ones worth pinning down.
 */
const json = { "content-type": "application/json" };

async function signUp(name: string): Promise<{ id: string; token: string }> {
  const res = await SELF.fetch("http://pool.test/api/players", {
    method: "POST",
    headers: json,
    body: JSON.stringify({ name }),
  });
  const body = (await res.json()) as { player: { id: string }; token: string };
  return { id: body.player.id, token: body.token };
}

describe("admin PIN", () => {
  it("locks a caller out after a run of wrong guesses, and lets the real PIN back in", async () => {
    const guess = (pin: string, ip = "203.0.113.7") =>
      SELF.fetch("http://pool.test/api/admin/verify", { method: "POST", headers: { "x-admin-pin": pin, "cf-connecting-ip": ip } });

    for (let i = 0; i < 7; i++) expect((await guess("0000")).status).toBe(401);
    // The eighth wrong guess starts the cool-off; everything after it is refused outright.
    expect((await guess("0000")).status).toBe(401);
    const locked = await guess("0000");
    expect(locked.status).toBe(429);
    expect(((await locked.json()) as any).error.code).toBe("PIN_LOCKED");
    // Even the correct PIN waits out the lock, so guessing can't be resumed by luck.
    expect((await guess("1234")).status).toBe(429);

    // The lock is per caller: it can't be used to keep the commissioner out of their own pool.
    expect((await guess("1234", "198.51.100.4")).status).toBe(200);
  });

  it("clears the count once the right PIN lands", async () => {
    const ip = "203.0.113.9";
    const guess = (pin: string) =>
      SELF.fetch("http://pool.test/api/admin/verify", { method: "POST", headers: { "x-admin-pin": pin, "cf-connecting-ip": ip } });
    for (let i = 0; i < 4; i++) expect((await guess("nope")).status).toBe(401);
    expect((await guess("1234")).status).toBe(200);
    // Back to a full allowance rather than one guess from a lockout.
    for (let i = 0; i < 7; i++) expect((await guess("nope")).status).toBe(401);
    expect((await guess("1234")).status).toBe(200);
  });
});

describe("signing up", () => {
  it("won't let one caller fill the roster in a loop", async () => {
    const signUpFrom = (name: string, ip: string) =>
      SELF.fetch("http://pool.test/api/players", {
        method: "POST",
        headers: { ...json, "cf-connecting-ip": ip },
        body: JSON.stringify({ name }),
      });

    for (let i = 0; i < 40; i++) expect((await signUpFrom(`Bulk ${i}`, "192.0.2.50")).status).toBe(201);
    const blocked = await signUpFrom("Bulk 41", "192.0.2.50");
    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as any).error.code).toBe("TOO_MANY_SIGNUPS");

    // Someone else joining from their own phone is unaffected.
    expect((await signUpFrom("Unrelated", "192.0.2.77")).status).toBe(201);
  });

  it("doesn't count returning to a name that already exists", async () => {
    const ip = "192.0.2.90";
    const body = (name: string) => ({ method: "POST", headers: { ...json, "cf-connecting-ip": ip }, body: JSON.stringify({ name }) });
    expect((await SELF.fetch("http://pool.test/api/players", body("Returning"))).status).toBe(201);
    // The same name back again is a collision, not a new seat, so it must not burn the allowance.
    for (let i = 0; i < 10; i++) expect((await SELF.fetch("http://pool.test/api/players", body("Returning"))).status).toBe(200);
    expect((await SELF.fetch("http://pool.test/api/players", body("Someone Else"))).status).toBe(201);
  });
});

describe("names", () => {
  it("refuses an obviously vulgar name at signup and on an entry, but not a real one", async () => {
    const rude = await SELF.fetch("http://pool.test/api/players", {
      method: "POST",
      headers: { ...json, "cf-connecting-ip": "192.0.2.120" },
      body: JSON.stringify({ name: "Fuckface" }),
    });
    expect(rude.status).toBe(400);
    expect(((await rude.json()) as any).error.code).toBe("INVALID_NAME");

    const me = await signUp("Cassandra Fukuda");
    const entry = await SELF.fetch("http://pool.test/api/entries", {
      method: "POST",
      headers: { ...json, "x-player-token": me.token },
      body: JSON.stringify({ name: "sh1thead" }),
    });
    expect(entry.status).toBe(400);

    const fine = await SELF.fetch("http://pool.test/api/entries", {
      method: "POST",
      headers: { ...json, "x-player-token": me.token },
      body: JSON.stringify({ name: "Parker" }),
    });
    expect(fine.status).toBe(201);
  });

  it("still lets the commissioner set any name, so a false positive is fixable", async () => {
    const me = await signUp("Renamable");
    const res = await SELF.fetch(`http://pool.test/api/admin/players/${me.id}`, {
      method: "PATCH",
      headers: { ...json, "x-admin-pin": "1234" },
      body: JSON.stringify({ name: "Scunthorpe United" }),
    });
    expect(res.status).toBe(200);
  });
});

describe("entries", () => {
  it("lets an account run a household, not fill the roster", async () => {
    const me = await signUp("Household");
    const headers = { ...json, "x-player-token": me.token };
    const add = (name: string) =>
      SELF.fetch("http://pool.test/api/entries", { method: "POST", headers, body: JSON.stringify({ name }) });

    for (let i = 0; i < 12; i++) expect((await add(`Kid ${i}`)).status).toBe(201);
    const over = await add("Kid 13");
    expect(over.status).toBe(403);
    expect(((await over.json()) as any).error.code).toBe("TOO_MANY_ENTRIES");
  });

  it("refuses to act as an entry that is not yours, and says so in a way the app can recover from", async () => {
    const mine = await signUp("Owner A");
    const theirs = await signUp("Owner B");
    const entry = await SELF.fetch("http://pool.test/api/entries", {
      method: "POST",
      headers: { ...json, "x-player-token": theirs.token },
      body: JSON.stringify({ name: "Their Kid" }),
    });
    const { player } = (await entry.json()) as { player: { id: string } };

    const res = await SELF.fetch("http://pool.test/api/bootstrap", {
      headers: { "x-player-token": mine.token, "x-entry-id": player.id },
    });
    expect(res.status).toBe(403);
    expect(((await res.json()) as any).error.code).toBe("ENTRY_FORBIDDEN");
  });
});
