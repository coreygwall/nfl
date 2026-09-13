import { describe, expect, it, beforeEach } from "vitest";
import { authToken, configFrom, forgetAuthTokens, send } from "../../worker/apns.ts";

/**
 * A throwaway P-256 key, generated for this file and good for nothing else. Apple's .p8 is the
 * same shape, so signing this proves the encoding is right — which is the part that fails
 * silently: a JWT Apple will not accept comes back as a flat 403 with no clue in it.
 */
const KEY = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgfUUXgobiDxdUnllo
r+q5T9F4Lwmyw3Q5SUkK/x0FAzGhRANCAAReEmfXd88J/IGftHwpMyFXHPI5FyHh
AB+MKZ43YBDTCMHBTJkSLjgltsaQvTyzqICDjnSpj0ahQxPJHzrVklX6
-----END PRIVATE KEY-----`;

const config = { key: KEY, keyId: "ABCDE12345", teamId: "8445LWRG3B", bundleId: "app.playtally.ios" };

const decode = (segment: string): Record<string, unknown> =>
  JSON.parse(atob(segment.replace(/-/g, "+").replace(/_/g, "/")));

beforeEach(forgetAuthTokens);

describe("the auth token", () => {
  it("is a three-part ES256 JWT naming the key and the team", async () => {
    const jwt = await authToken(config);
    const [header, claims, signature] = jwt.split(".");
    expect(decode(header!)).toEqual({ alg: "ES256", kid: "ABCDE12345" });
    expect(decode(claims!)).toEqual({ iss: "8445LWRG3B", iat: expect.any(Number) });
    // ES256 is a raw r‖s pair: 64 bytes, which is 86 base64url characters with no padding.
    expect(signature).toHaveLength(86);
    expect(jwt).not.toMatch(/[+/=]/);
  });

  it("is reused rather than minted per push — Apple rate-limits that", async () => {
    const first = await authToken(config, 1_000_000_000_000);
    const soon = await authToken(config, 1_000_000_000_000 + 60_000);
    expect(soon).toBe(first);
  });

  it("is replaced before Apple would call it stale", async () => {
    const first = await authToken(config, 1_000_000_000_000);
    const later = await authToken(config, 1_000_000_000_000 + 50 * 60_000);
    expect(later).not.toBe(first);
  });
});

describe("sending", () => {
  const capture = () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;
    return { calls, fake };
  };

  it("posts to the host the token belongs to, with the bundle id as the topic", async () => {
    const { calls, fake } = capture();
    await send(config, { token: "abc123", environment: "sandbox", payload: { aps: {} } }, fake);
    expect(calls[0]!.url).toBe("https://api.sandbox.push.apple.com/3/device/abc123");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["apns-topic"]).toBe("app.playtally.ios");
    expect(headers["apns-push-type"]).toBe("alert");
    expect(headers.authorization).toMatch(/^bearer ey/);

    const production = capture();
    await send(config, { token: "abc123", environment: "production", payload: {} }, production.fake);
    expect(production.calls[0]!.url).toBe("https://api.push.apple.com/3/device/abc123");
  });

  it("sends a Live Activity to the bundle id's sub-topic", async () => {
    const { calls, fake } = capture();
    await send(
      config,
      { token: "t", environment: "production", payload: {}, pushType: "liveactivity", topicSuffix: "push-type.liveactivity" },
      fake,
    );
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers["apns-topic"]).toBe("app.playtally.ios.push-type.liveactivity");
    expect(headers["apns-push-type"]).toBe("liveactivity");
  });

  it("recognises a dead token so it can be forgotten", async () => {
    const gone = (async () =>
      new Response(JSON.stringify({ reason: "Unregistered" }), { status: 410 })) as unknown as typeof fetch;
    expect(await send(config, { token: "t", environment: "production", payload: {} }, gone)).toMatchObject({
      ok: false,
      gone: true,
      reason: "Unregistered",
    });

    const wrongHost = (async () =>
      new Response(JSON.stringify({ reason: "BadDeviceToken" }), { status: 400 })) as unknown as typeof fetch;
    expect((await send(config, { token: "t", environment: "production", payload: {} }, wrongHost)).gone).toBe(true);
  });

  it("does not forget a token over a problem at Apple's end", async () => {
    const busy = (async () =>
      new Response(JSON.stringify({ reason: "TooManyRequests" }), { status: 429 })) as unknown as typeof fetch;
    expect(await send(config, { token: "t", environment: "production", payload: {} }, busy)).toMatchObject({
      ok: false,
      gone: false,
      status: 429,
    });
  });

  it("treats a network failure as a failure, not a crash", async () => {
    const dead = (async () => {
      throw new Error("connection reset");
    }) as unknown as typeof fetch;
    expect(await send(config, { token: "t", environment: "production", payload: {} }, dead)).toMatchObject({
      ok: false,
      status: 0,
      gone: false,
    });
  });
});

describe("configuration", () => {
  it("is nothing at all until every part is set", () => {
    expect(configFrom({})).toBeNull();
    expect(configFrom({ APNS_KEY: KEY, APNS_KEY_ID: "x", APPLE_TEAM_ID: "y" })).toBeNull();
    expect(
      configFrom({ APNS_KEY: KEY, APNS_KEY_ID: "x", APPLE_TEAM_ID: "y", APPLE_BUNDLE_ID: "z" }),
    ).toEqual({ key: KEY, keyId: "x", teamId: "y", bundleId: "z" });
  });
});
