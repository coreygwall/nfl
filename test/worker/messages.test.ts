import { SELF, env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

async function api(path: string, token = '', method = 'GET', body?: unknown, entry = '') {
  const response = await SELF.fetch(`http://pool.test/api${path}`, {
    method, headers: { 'content-type': 'application/json', 'x-player-token': token, 'x-entry-id': entry },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any };
}
// A counter rather than a slice of a UUID. The name has to be new on each call — a name that
// already exists comes back without a token — but a random hex suffix is eight characters drawn
// from `0-9a-f`, and the signup door runs names past the profanity filter, which reads leetspeak:
// `a55` is "ass". About one call in 2,300 was refused with a 400, and since the 400 carries no
// token the failure surfaced two lines later as `/roles/claim` answering 401 to a request with no
// account on it — nowhere near the name that caused it. A counter cannot spell anything.
let hosts = 0;
async function setup() {
  const owner = (await api('/players', '', 'POST', { name: `Host ${++hosts}` })).body;
  // Say so here rather than letting a tokenless owner become an unexplained 401 on the next line.
  expect(owner.token, `signing up Host ${hosts} should return a token, got ${JSON.stringify(owner)}`).toBeTruthy();
  const claimed = await SELF.fetch('http://pool.test/api/roles/claim', { method: 'POST', headers: { 'x-player-token': owner.token, 'x-admin-pin': '1234' } });
  expect(claimed.status).toBe(200);
  return owner;
}

describe('pool announcements', () => {
  it('enforces commissioner-only settings, posting, editing and deletion, including when disabled', async () => {
    const owner = await setup();
    const member = (await api('/players', '', 'POST', { name: 'Reader One' })).body;
    expect((await api('/messages')).body.enabled).toBe(false);
    expect((await api('/messages', owner.token, 'POST', { body: 'Hello' })).status).toBe(403);
    expect((await api('/messages/settings', member.token, 'PATCH', { enabled: true })).status).toBe(403);
    expect((await api('/messages/settings', owner.token, 'PATCH', { enabled: true, postingPolicy: 'members' })).status).toBe(400);
    expect((await api('/messages/settings', owner.token, 'PATCH', { enabled: true })).status).toBe(200);
    expect((await api('/messages', '', 'POST', { body: 'Hello' })).status).toBe(401);
    expect((await api('/messages', member.token, 'POST', { body: 'Hello' })).status).toBe(403);
    for (const body of ['', '   ', 'x'.repeat(2001)]) expect((await api('/messages', owner.token, 'POST', { body })).status).toBe(400);
    expect((await api('/messages', owner.token, 'POST', { body: 'Reply', parentId: 'anything' })).status).toBe(400);
    const created = await api('/messages', owner.token, 'POST', { body: ' Hello pool ' });
    expect(created.status).toBe(201);
    const path = `/messages/${created.body.id}`;
    expect((await api(path, member.token, 'PATCH', { body: 'Changed' })).status).toBe(403);
    expect((await api(path, member.token, 'DELETE')).status).toBe(403);
    expect((await api(path, owner.token, 'PATCH', { body: 'Edited' })).status).toBe(200);
    expect((await api('/messages')).body.messages[0].body).toBe('Edited');
    await api('/messages/settings', owner.token, 'PATCH', { enabled: false });
    expect((await api('/messages', member.token)).body.messages).toEqual([]);
    expect((await api('/messages')).body.messages).toEqual([]);
    expect((await api(`${path}/like`, member.token, 'PUT')).status).toBe(403);
    expect((await api('/messages', owner.token)).body.messages).toHaveLength(1);
    await api('/messages/settings', owner.token, 'PATCH', { enabled: true });
    expect((await api('/messages')).body.messages).toHaveLength(1);
    expect((await api(path, owner.token, 'DELETE')).status).toBe(200);
    expect((await api('/messages')).body.messages).toEqual([]);
  });

  it('attributes posts and idempotent likes to accounts, not managed entries', async () => {
    const owner = await setup();
    const child = (await api('/entries', owner.token, 'POST', { name: 'Child Entry' })).body.player;
    await api('/messages/settings', owner.token, 'PATCH', { enabled: true });
    const created = await api('/messages', owner.token, 'POST', { body: 'Account author' }, child.id);
    const path = `/messages/${created.body.id}/like`;
    expect((await api(path, '', 'PUT')).status).toBe(401);
    expect((await api(path, owner.token, 'PUT')).status).toBe(200);
    expect((await api(path, owner.token, 'PUT', undefined, child.id)).status).toBe(200);
    const feed = (await api('/messages', owner.token, 'GET', undefined, child.id)).body;
    expect(feed.messages[0]).toMatchObject({ authorName: owner.player.name, liked: true, likes: 1 });
    expect((await api('/messages')).body.messages[0].liked).toBe(false);
    expect((await api(path, owner.token, 'DELETE', undefined, child.id)).status).toBe(200);
    expect((await api(path, owner.token, 'DELETE')).status).toBe(200);
    expect((await api('/messages', owner.token)).body.messages[0].likes).toBe(0);
    await api(path, owner.token, 'PUT');
    await api(`/messages/${created.body.id}`, owner.token, 'DELETE');
    const reactions = await env.DB.prepare('SELECT COUNT(*) AS count FROM pool_message_reactions WHERE message_id = ?').bind(created.body.id).first<{ count: number }>();
    expect(reactions?.count).toBe(0);
  });

  it('paginates tied timestamps and never reads or mutates another pool’s posts', async () => {
    const owner = await setup();
    await api('/messages/settings', owner.token, 'PATCH', { enabled: true });
    const pool = (await api('/roles', owner.token)).body.pool;
    await env.DB.prepare("INSERT INTO pools (id, slug, name, type, season, created_at) VALUES ('other', 'other', 'Other', 'High Five', 2026, '2026-01-01')").run();
    const statements = Array.from({ length: 22 }, (_, i) => env.DB.prepare('INSERT INTO pool_messages (id, pool_id, author_name, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').bind(`post-${String(i).padStart(2, '0')}`, pool.id, 'Host', 'Hello', '2026-01-01', '2026-01-01'));
    await env.DB.batch(statements);
    await env.DB.prepare("INSERT INTO pool_messages (id, pool_id, author_name, body, created_at, updated_at) VALUES ('foreign', 'other', 'Other', 'Private', '2026-01-01', '2026-01-01')").run();
    const first = (await api('/messages', owner.token)).body;
    expect(first.messages).toHaveLength(20);
    const second = (await api(`/messages?before=${first.nextCursor}`, owner.token)).body;
    expect(second.messages).toHaveLength(2);
    expect(second.nextCursor).toBe(null);
    expect(new Set([...first.messages, ...second.messages].map(m => m.id)).size).toBe(22);
    expect((await api('/messages?before=foreign', owner.token)).status).toBe(400);
    expect((await api('/messages/foreign', owner.token, 'PATCH', { body: 'Changed' })).status).toBe(404);
    expect((await api('/messages/foreign', owner.token, 'DELETE')).status).toBe(404);
    expect((await api('/messages/foreign/like', owner.token, 'PUT')).status).toBe(404);
  });
});
