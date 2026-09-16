import { SELF, env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { dispatchNotifications } from '../../worker/notify.ts';
import type { ApnsConfig, PushRequest, PushResult } from '../../worker/apns.ts';

/**
 * The switches, where they actually bite.
 *
 * `shared/notify-prefs.ts` has the rule and its own tests; this is the wiring, which is the half
 * that was missing. `prefs` had been stored and parsed since push landed and `dispatchNotifications`
 * never looked at it, so a settings screen built on top would have been a row of controls that did
 * nothing. Every assertion here is about which device the Worker actually sends to.
 */

const SEASON = 2026;
/** APNs tokens are 64 hex characters; these only need to be distinct and well formed. */
const token = (seed: string) => seed.repeat(64).slice(0, 64);
/** Wednesday evening: about two hours before the Thursday kickoff, so a nudge is due. */
const NUDGE_TIME = '2026-10-08T22:20:00.000Z';
const KICKOFF = '2026-10-09T00:15:00.000Z';

const config: ApnsConfig = {
  keyId: 'KEY1234567',
  teamId: 'TEAM123456',
  bundleId: 'app.playtally.ios',
  key: 'unused — the sender is stubbed',
};

/** Records who we tried to reach instead of talking to Apple. */
function recorder() {
  const hit: string[] = [];
  const send = async (_c: ApnsConfig, request: PushRequest): Promise<PushResult> => {
    hit.push(request.token);
    return { ok: true, status: 200, gone: false };
  };
  return { hit, send };
}

async function seed(prefsByToken: Record<string, unknown>) {
  const now = '2026-10-01T00:00:00.000Z';
  await env.DB.batch([
    env.DB.prepare('INSERT INTO players (id, name, name_key, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)')
      .bind('me', 'Corey', 'corey', now, now),
    env.DB.prepare('INSERT INTO players (id, name, name_key, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)')
      .bind('kid', 'Parker', 'parker', now, now),
    env.DB.prepare('INSERT INTO games (id, season, week, kickoff_at, away, home) VALUES (?, ?, ?, ?, ?, ?)')
      .bind('thu', SEASON, 5, KICKOFF, 'MIA', 'NYJ'),
  ]);
  // Neither has picked, so both are owed a nudge — which is the message these tests filter.
  for (const [token, prefs] of Object.entries(prefsByToken)) {
    await env.DB.prepare(
      `INSERT INTO push_tokens (token, environment, account_id, player_id, prefs, created_at, last_seen_at)
       VALUES (?, 'production', NULL, ?, ?, ?, ?)`,
    )
      .bind(token, token.startsWith('kid') ? 'kid' : 'me', JSON.stringify(prefs), now, now)
      .run();
  }
}

describe('notification preferences decide who hears', () => {
  beforeEach(async () => {
    // One request is what runs the migrations: `ensureReady` hangs off the Worker, not off the
    // test harness, so a suite that only ever touches D1 directly finds no tables at all.
    await SELF.fetch('http://pool.test/api/bootstrap');
    await env.DB.batch([
      env.DB.prepare('DELETE FROM notifications_sent'),
      env.DB.prepare('DELETE FROM push_tokens'),
      env.DB.prepare('DELETE FROM picks'),
      env.DB.prepare('DELETE FROM games'),
      env.DB.prepare('DELETE FROM players'),
    ]);
  });

  it('reaches a device that has set nothing', async () => {
    const only = token('a');
    await seed({ [only]: {} });
    const { hit, send } = recorder();
    const report = await dispatchNotifications(env, SEASON, NUDGE_TIME, config, send);
    expect(hit).toEqual([only]);
    expect(report.delivered).toBe(1);
    expect(report.muted).toBe(0);
  });

  it('skips a device that switched this kind off, and still reaches one that did not', async () => {
    const off = token('b');
    const on = token('c');
    await seed({ [off]: { kinds: { picksDue: false } }, [on]: {} });
    const { hit, send } = recorder();
    await dispatchNotifications(env, SEASON, NUDGE_TIME, config, send);
    expect(hit).toEqual([on]);
  });

  /// A parent with four entries wants their own week, not four phones' worth of it.
  it('honours muting one entry without touching another', async () => {
    const mine = token('d');
    const theirs = 'kid' + token('e').slice(3);
    await seed({ [mine]: {}, [theirs]: { entries: { kid: { muted: true } } } });
    const { hit, send } = recorder();
    await dispatchNotifications(env, SEASON, NUDGE_TIME, config, send);
    expect(hit).toEqual([mine]);
  });

  /**
   * A message nobody asked for is settled, not deferred.
   *
   * `unreachable` means a send failed and a later run should try again. A preference is the
   * opposite: the answer will be the same in half an hour and every half hour after that, so the
   * message is claimed and counted as muted rather than left to be re-attempted all week.
   */
  it('does not leave a muted message to be retried forever', async () => {
    const off = token('f');
    await seed({ [off]: { kinds: { picksDue: false } } });
    const { hit, send } = recorder();
    const first = await dispatchNotifications(env, SEASON, NUDGE_TIME, config, send);
    expect(hit).toEqual([]);
    expect(first.muted).toBeGreaterThan(0);
    expect(first.unreachable).toBe(0);

    // The next sweep finds it already claimed and says nothing at all.
    const second = await dispatchNotifications(env, SEASON, NUDGE_TIME, config, send);
    expect(second.muted).toBe(0);
    expect(second.sent).toBe(0);
  });

  /// Rows written before this existed hold a flat map. They meant the device default, and still do.
  it('still honours the flat shape an older build wrote', async () => {
    const legacy = token('0');
    await seed({ [legacy]: { picksDue: false } });
    const { hit, send } = recorder();
    await dispatchNotifications(env, SEASON, NUDGE_TIME, config, send);
    expect(hit).toEqual([]);
  });
});
