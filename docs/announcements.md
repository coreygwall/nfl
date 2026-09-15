# Pool communication

The first release is a web/mobile-web broadcast feed, not chat. Announcements default off.
Commissioners (and existing platform administrators) can enable it, post, edit, and delete.
An enabled feed is readable by pool visitors, like the existing public standings. Only signed-in
accounts can like. Disabling hides content from visitors and members without deleting it;
commissioners can still moderate existing posts. The UI confirms permanent deletion.

## Extension points

- `pool_communication_settings` belongs to a pool, separately from posts. `posting_policy` reserves
  `members` for a future release, but the API currently rejects that setting and authorizes every
  write against account roles. Do not enable member posting with a UI-only toggle.
- `pool_messages` stores account authorship, an author-name/role snapshot, timestamps, and nullable
  `parent_id`. Creation rejects replies today. When enabling replies, validate the parent's pool,
  add threading pagination and moderation rules, and enforce the posting policy server-side.
- `pool_message_reactions` has a composite key for message, account, and reaction. Only `like` is
  accepted today. Explicit PUT/DELETE keeps retries idempotent and family entry switching cannot
  add extra votes. Extend the reaction constraint and API together for additional emoji.
- Every query and mutation resolves its pool using `currentPool`; no caller-supplied pool ID is
  trusted. Deployments currently contain one pool. Multi-pool membership checks must be introduced
  alongside the application's future shared-deployment pool resolver, before enabling member chat.
- Feed uses a bounded 20-post cursor page ordered by timestamp and ID. Home displays two recent
  posts. React Query polls while mounted; no websocket or notification infrastructure is needed.
- Plain text is rendered by React, never as HTML. Bodies are limited to 2,000 characters.

Native iOS presentation, push alerts, unread badges, attachments, replies, and member posting are
not part of this first release. The shared JSON API is reusable by the native client.

Migration `0011_messages.sql` is additive and loaded by the existing `ensureReady` mechanism.
