import { Hono } from 'hono';
import type { AppEnv } from '../env.ts';
import { ApiError, badRequest, notFound } from '../errors.ts';
import { currentPool, rolesOf } from '../roles.ts';
import { MESSAGE_MAX_LENGTH, type MessagesResponse } from '../../shared/messages.ts';

export const messageRoutes = new Hono<AppEnv>();

// Do not accept a PIN-only identity: every announcement and reaction needs an account author.
async function access(c: Parameters<typeof currentPool>[0], manage = false) {
  const pool = await currentPool(c);
  const roles = await rolesOf(c);
  const account = c.get('account');
  const canManage = !!account && (roles.commissioner || roles.platformAdmin);
  if (manage && !canManage) throw new ApiError(account ? 403 : 401, 'NOT_COMMISSIONER', 'Only this pool’s commissioners can do that.');
  const settings = await c.env.DB.prepare('SELECT enabled FROM pool_communication_settings WHERE pool_id = ?').bind(pool.id).first<{ enabled: number }>();
  return { pool, account, canManage, enabled: settings?.enabled === 1 };
}

async function messageBody(c: Parameters<typeof currentPool>[0]) {
  const data = await c.req.json().catch(() => null) as { body?: unknown; parentId?: unknown } | null;
  const body = typeof data?.body === 'string' ? data.body.trim() : '';
  if (!body || body.length > MESSAGE_MAX_LENGTH) throw badRequest('INVALID_MESSAGE', `Write between 1 and ${MESSAGE_MAX_LENGTH} characters.`);
  if (data?.parentId != null) throw badRequest('REPLIES_DISABLED', 'Replies are not available yet.');
  return body;
}

messageRoutes.get('/', async (c) => {
  const { pool, account, canManage, enabled } = await access(c);
  const response: MessagesResponse = { enabled, postingPolicy: 'commissioners', canManage, canReact: !!account && enabled, messages: [], nextCursor: null };
  if (!enabled && !canManage) return c.json(response);
  const cursor = c.req.query('before');
  let before: { created_at: string; id: string } | null = null;
  if (cursor) {
    before = await c.env.DB.prepare('SELECT created_at, id FROM pool_messages WHERE id = ? AND pool_id = ?').bind(cursor, pool.id).first();
    if (!before) throw badRequest('INVALID_CURSOR', 'Refresh announcements and try again.');
  }
  const rows = await c.env.DB.prepare(`SELECT m.id, m.author_name AS authorName, m.author_role AS authorRole,
    m.body, m.created_at AS createdAt, m.updated_at AS updatedAt,
    (SELECT COUNT(*) FROM pool_message_reactions r WHERE r.message_id = m.id) AS likes,
    EXISTS(SELECT 1 FROM pool_message_reactions r WHERE r.message_id = m.id AND r.account_id = ?) AS liked
    FROM pool_messages m WHERE m.pool_id = ? AND m.parent_id IS NULL
    AND (? IS NULL OR m.created_at < ? OR (m.created_at = ? AND m.id < ?))
    ORDER BY m.created_at DESC, m.id DESC LIMIT 21`).bind(account?.id ?? '', pool.id, before?.id ?? null, before?.created_at ?? '', before?.created_at ?? '', before?.id ?? '').all<Omit<MessagesResponse['messages'][number], 'liked'> & { liked: number }>();
  response.messages = rows.results.slice(0, 20).map(r => ({ ...r, liked: !!r.liked }));
  response.nextCursor = rows.results.length > 20 ? response.messages.at(-1)!.id : null;
  return c.json(response);
});

messageRoutes.patch('/settings', async (c) => {
  const { pool } = await access(c, true);
  const body = await c.req.json().catch(() => null) as { enabled?: unknown; postingPolicy?: unknown } | null;
  if (typeof body?.enabled !== 'boolean' || (body.postingPolicy !== undefined && body.postingPolicy !== 'commissioners')) throw badRequest('INVALID_SETTINGS', 'Choose whether announcements are on or off. Member posting is not available yet.');
  await c.env.DB.prepare(`INSERT INTO pool_communication_settings (pool_id, enabled, posting_policy) VALUES (?, ?, 'commissioners')
    ON CONFLICT(pool_id) DO UPDATE SET enabled = excluded.enabled, posting_policy = 'commissioners'`).bind(pool.id, body.enabled ? 1 : 0).run();
  return c.json({ ok: true });
});

messageRoutes.post('/', async (c) => {
  const { pool, account, enabled } = await access(c, true);
  if (!enabled) throw new ApiError(403, 'FEED_DISABLED', 'Turn on announcements before posting.');
  const body = await messageBody(c);
  const id = crypto.randomUUID();
  await c.env.DB.prepare(`INSERT INTO pool_messages (id, pool_id, author_account_id, author_name, body, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id, pool.id, account!.id, account!.name, body, c.get('now'), c.get('now')).run();
  return c.json({ id }, 201);
});

messageRoutes.patch('/:id', async (c) => {
  const { pool } = await access(c, true);
  const body = await messageBody(c);
  const result = await c.env.DB.prepare('UPDATE pool_messages SET body = ?, updated_at = ? WHERE id = ? AND pool_id = ? AND parent_id IS NULL').bind(body, c.get('now'), c.req.param('id'), pool.id).run();
  if (!result.meta.changes) throw notFound('MESSAGE_NOT_FOUND', 'Announcement not found.');
  return c.json({ ok: true });
});

messageRoutes.delete('/:id', async (c) => {
  const { pool } = await access(c, true);
  const result = await c.env.DB.prepare('DELETE FROM pool_messages WHERE id = ? AND pool_id = ?').bind(c.req.param('id'), pool.id).run();
  if (!result.meta.changes) throw notFound('MESSAGE_NOT_FOUND', 'Announcement not found.');
  return c.json({ ok: true });
});

// Explicit PUT/DELETE, not a toggle: retries cannot reverse a member's intended reaction.
messageRoutes.on(['PUT', 'DELETE'], '/:id/like', async (c) => {
  const { pool, account, enabled } = await access(c);
  if (!account) throw new ApiError(401, 'NO_PLAYER', 'Sign in to like an announcement.');
  if (!enabled) throw new ApiError(403, 'FEED_DISABLED', 'Announcements are turned off.');
  const id = c.req.param('id');
  const message = await c.env.DB.prepare('SELECT id FROM pool_messages WHERE id = ? AND pool_id = ?').bind(id, pool.id).first();
  if (!message) throw notFound('MESSAGE_NOT_FOUND', 'Announcement not found.');
  if (c.req.method === 'PUT') {
    await c.env.DB.prepare('INSERT OR IGNORE INTO pool_message_reactions (message_id, account_id) VALUES (?, ?)').bind(id, account.id).run();
  } else {
    await c.env.DB.prepare('DELETE FROM pool_message_reactions WHERE message_id = ? AND account_id = ?').bind(id, account.id).run();
  }
  return c.json({ ok: true });
});
