/**
 * Talking to Apple Push Notification service.
 *
 * APNs authenticates with a short-lived JWT signed by a P-256 key you download once from the Apple
 * developer portal. That is the whole of the secret material: no certificates, no annual renewal.
 * Everything here runs on WebCrypto, which Workers has, so there is no dependency to keep current.
 */

const B64URL = (bytes: ArrayBuffer | Uint8Array): string => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const b of view) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const utf8 = (s: string) => new TextEncoder().encode(s);

/**
 * Strip the PEM armour and decode. A .p8 from Apple is PKCS#8, which is what WebCrypto wants.
 * Returns the buffer rather than a view: `importKey` wants a plain `ArrayBuffer`, and a
 * `Uint8Array` built the usual way is typed as possibly backing onto a shared one.
 */
function pkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const raw = atob(body);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return buffer;
}

export interface ApnsConfig {
  /** Contents of the .p8 file, PEM and all. */
  key: string;
  /** The key's 10-character id, from the portal. */
  keyId: string;
  /** The Apple developer team id. */
  teamId: string;
  /** The app's bundle id, which is the APNs topic. */
  bundleId: string;
}

interface CachedToken {
  jwt: string;
  issuedAt: number;
}

/**
 * Apple rejects a token older than an hour and rate-limits minting more than one every 20 minutes,
 * so a token is held for most of its life. Module scope survives between requests on a warm
 * isolate and is simply rebuilt on a cold one, which is exactly the behaviour we want.
 */
const cache = new Map<string, CachedToken>();
const TOKEN_TTL_MS = 45 * 60 * 1000;

export async function authToken(config: ApnsConfig, now: number = Date.now()): Promise<string> {
  const cached = cache.get(config.keyId);
  if (cached && now - cached.issuedAt < TOKEN_TTL_MS) return cached.jwt;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8(config.key),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const iat = Math.floor(now / 1000);
  const header = B64URL(utf8(JSON.stringify({ alg: "ES256", kid: config.keyId })));
  const claims = B64URL(utf8(JSON.stringify({ iss: config.teamId, iat })));
  const signing = `${header}.${claims}`;
  // WebCrypto returns ECDSA signatures as raw r‖s, which is precisely the JOSE encoding. No DER.
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, utf8(signing));
  const jwt = `${signing}.${B64URL(signature)}`;
  cache.set(config.keyId, { jwt, issuedAt: now });
  return jwt;
}

/** Only for tests, which would otherwise see a token minted by an earlier case. */
export const forgetAuthTokens = (): void => void cache.clear();

export type PushEnvironment = "sandbox" | "production";

const HOST: Record<PushEnvironment, string> = {
  sandbox: "https://api.sandbox.push.apple.com",
  production: "https://api.push.apple.com",
};

export type PushType = "alert" | "background" | "liveactivity";

export interface PushRequest {
  token: string;
  environment: PushEnvironment;
  payload: unknown;
  pushType?: PushType;
  /** A later message with the same id replaces an earlier one on the lock screen. */
  collapseId?: string;
  /** Seconds since the epoch after which Apple should stop trying. 0 means "one attempt". */
  expiration?: number;
  priority?: 1 | 5 | 10;
  /** Live Activity pushes go to a sub-topic of the bundle id. */
  topicSuffix?: string;
}

export interface PushResult {
  ok: boolean;
  status: number;
  /** Apple's machine-readable reason, e.g. "BadDeviceToken". */
  reason?: string;
  /** True when this token will never work again and should be forgotten. */
  gone: boolean;
}

/** Apple's way of saying the app was deleted or the token was never ours. */
const GONE = new Set(["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic", "TopicDisallowed"]);

export async function send(
  config: ApnsConfig,
  request: PushRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<PushResult> {
  const jwt = await authToken(config);
  const headers: Record<string, string> = {
    authorization: `bearer ${jwt}`,
    "apns-topic": request.topicSuffix ? `${config.bundleId}.${request.topicSuffix}` : config.bundleId,
    "apns-push-type": request.pushType ?? "alert",
    "apns-priority": String(request.priority ?? 10),
    "content-type": "application/json",
  };
  if (request.collapseId) headers["apns-collapse-id"] = request.collapseId.slice(0, 64);
  if (request.expiration !== undefined) headers["apns-expiration"] = String(request.expiration);

  let res: Response;
  try {
    res = await fetchImpl(`${HOST[request.environment]}/3/device/${request.token}`, {
      method: "POST",
      headers,
      body: JSON.stringify(request.payload),
    });
  } catch (err) {
    return { ok: false, status: 0, reason: err instanceof Error ? err.message : String(err), gone: false };
  }
  if (res.status === 200) return { ok: true, status: 200, gone: false };
  let reason: string | undefined;
  try {
    reason = ((await res.json()) as { reason?: string }).reason;
  } catch {
    reason = undefined;
  }
  // 410 is Apple's dedicated "this token is dead"; the 400 reasons above mean the same thing.
  return { ok: false, status: res.status, reason, gone: res.status === 410 || (reason ? GONE.has(reason) : false) };
}

/** Reads the APNs settings out of the environment, or nothing if the key has not been set yet. */
export function configFrom(env: {
  APNS_KEY?: string;
  APNS_KEY_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_BUNDLE_ID?: string;
}): ApnsConfig | null {
  const { APNS_KEY, APNS_KEY_ID, APPLE_TEAM_ID, APPLE_BUNDLE_ID } = env;
  if (!APNS_KEY || !APNS_KEY_ID || !APPLE_TEAM_ID || !APPLE_BUNDLE_ID) return null;
  return { key: APNS_KEY, keyId: APNS_KEY_ID, teamId: APPLE_TEAM_ID, bundleId: APPLE_BUNDLE_ID };
}
