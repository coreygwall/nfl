import { useState } from 'react';
import { Link } from 'react-router';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client.ts';
import { usePlayer } from '../lib/player.tsx';
import { MESSAGE_MAX_LENGTH, type MessagesResponse, type PoolMessage } from '../../shared/messages.ts';

export function Announcements({ preview = false, settings = false }: { preview?: boolean; settings?: boolean }) {
  const { player } = usePlayer();
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const feed = useInfiniteQuery({
    queryKey: ['messages', player?.id ?? null],
    initialPageParam: '',
    queryFn: ({ pageParam }) => api<MessagesResponse>(`/messages${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ''}`),
    getNextPageParam: page => page.nextCursor ?? undefined,
    refetchInterval: 60_000,
  });
  const write = useMutation({
    mutationFn: ({ path = '', method = 'POST', body }: { path?: string; method?: string; body?: unknown }) => api(`/messages${path}`, { method, body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['messages'] }),
  });
  const data = feed.data?.pages[0];
  if (feed.isPending) return <p className="mt-5 text-sm text-ink-2" role="status">Loading announcements…</p>;
  if (!data) return <div className="mt-5 text-sm" role="alert">Couldn't load announcements. <button className="underline" onClick={() => void feed.refetch()}>Try again</button></div>;
  if (!data.enabled && !data.canManage && preview) return null;
  const messages = [...new Map(feed.data!.pages.flatMap(page => page.messages).map(message => [message.id, message])).values()];
  const shown = preview ? messages.slice(0, 2) : messages;
  return (
    <section className="card-flat mt-5 bg-surface p-4" aria-label="Announcements">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-extrabold">Announcements</h2>
        {preview && (data.enabled || data.canManage) && <Link className="btn btn-sm" to="/announcements">View all</Link>}
      </div>
      <p className="mt-1 text-sm text-ink-2">Updates from your commissioners. Like a message to show you've seen it.</p>
      {data.canManage && (settings || !preview) && (
        <div className="my-4 border-y-2 border-dashed border-line py-3">
          <button className="btn btn-sm" role="switch" aria-checked={data.enabled} disabled={write.isPending}
            onClick={() => write.mutate({ path: '/settings', method: 'PATCH', body: { enabled: !data.enabled } })}>
            Announcements {data.enabled ? 'on' : 'off'}
          </button>
          <p className="mt-2 text-xs text-ink-2">Only commissioners can post. Members can like; replies are off. Turning this off hides posts without deleting them.</p>
        </div>
      )}
      {!data.enabled && <p className="mt-3 text-sm text-ink-2">Announcements are off.{data.canManage ? ' Existing posts are visible only to commissioners.' : ''}</p>}
      {data.canManage && !preview && data.enabled && (
        <form className="mt-4" onSubmit={e => { e.preventDefault(); write.mutate({ body: { body: draft } }, { onSuccess: () => setDraft('') }); }}>
          <label className="block text-sm font-bold" htmlFor="new-announcement">Message to the pool</label>
          <textarea id="new-announcement" className="card-flat mt-2 min-h-28 w-full bg-paper p-3" maxLength={MESSAGE_MAX_LENGTH} value={draft} onChange={e => setDraft(e.target.value)} disabled={write.isPending} required />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-ink-2">{draft.length}/{MESSAGE_MAX_LENGTH}</span>
            <button className="btn btn-primary btn-sm" disabled={write.isPending || !draft.trim()}>{write.isPending ? 'Saving…' : 'Post announcement'}</button>
          </div>
        </form>
      )}
      {write.error && <p role="alert" className="mt-3 text-sm text-danger">{write.error.message}</p>}
      {feed.isRefetchError && <p role="alert" className="mt-3 text-sm text-danger">Couldn't refresh. Showing the last loaded announcements.</p>}
      {data.enabled && !messages.length && <p className="mt-4 text-sm text-ink-2">No announcements yet.</p>}
      <div className="mt-3 space-y-4">
        {shown.map(message => <Announcement key={message.id} message={message} canManage={data.canManage && !preview} canReact={data.canReact} />)}
      </div>
      {!preview && feed.hasNextPage && <button className="btn btn-sm mt-4" disabled={feed.isFetchingNextPage} onClick={() => void feed.fetchNextPage()}>{feed.isFetchingNextPage ? 'Loading…' : 'Older announcements'}</button>}
      {!preview && feed.isFetchNextPageError && <p role="alert" className="mt-2 text-sm text-danger">Couldn't load older announcements. Try again.</p>}
    </section>
  );
}

function Announcement({ message, canManage, canReact }: { message: PoolMessage; canManage: boolean; canReact: boolean }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [body, setBody] = useState(message.body);
  const write = useMutation({
    mutationFn: ({ method, like = false, body }: { method: string; like?: boolean; body?: unknown }) => api(`/messages/${message.id}${like ? '/like' : ''}`, { method, body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['messages'] }),
  });
  return (
    <article className="border-t-2 border-line pt-4">
      <p className="text-sm font-bold">{message.authorName} <span className="chip ml-1 bg-paper-2 text-xs">Commissioner</span></p>
      <p className="mt-1 text-xs text-ink-2"><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time>{message.updatedAt !== message.createdAt ? ' · Edited' : ''}</p>
      {editing ? <form className="mt-3" onSubmit={e => { e.preventDefault(); write.mutate({ method: 'PATCH', body: { body } }, { onSuccess: () => setEditing(false) }); }}>
        <label className="block text-sm font-bold" htmlFor={`edit-${message.id}`}>Edit announcement</label>
        <textarea id={`edit-${message.id}`} className="card-flat mt-2 min-h-28 w-full bg-paper p-3" maxLength={MESSAGE_MAX_LENGTH} value={body} onChange={e => setBody(e.target.value)} disabled={write.isPending} required />
        <button className="btn btn-sm mt-2" disabled={write.isPending || !body.trim()}>Save changes</button>
        <button type="button" className="btn btn-ghost btn-sm ml-2" disabled={write.isPending} onClick={() => setEditing(false)}>Cancel</button>
      </form> : <p className="mt-3 whitespace-pre-wrap break-words text-sm">{message.body}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className={`btn btn-sm ${message.liked ? 'btn-primary' : ''}`} aria-pressed={message.liked} aria-label={`${message.liked ? 'Unlike' : 'Like'} announcement by ${message.authorName}`} disabled={!canReact || write.isPending}
          onClick={() => write.mutate({ method: message.liked ? 'DELETE' : 'PUT', like: true })}>👍 {message.likes} {message.liked ? 'Liked' : 'Like'}</button>
        {canManage && !editing && <>
          <button className="btn btn-ghost btn-sm" disabled={write.isPending} onClick={() => { setBody(message.body); setEditing(true); }}>Edit</button>
          <button className="btn btn-ghost btn-sm" disabled={write.isPending} onClick={() => setDeleting(true)}>Delete</button>
        </>}
      </div>
      {deleting && <div className="mt-3 rounded-lg border-2 border-danger p-3">
        <p className="text-sm">Delete this announcement and its likes? This cannot be undone.</p>
        <button className="btn btn-sm mt-2" disabled={write.isPending} onClick={() => write.mutate({ method: 'DELETE' })}>Confirm delete</button>
        <button className="btn btn-ghost btn-sm ml-2" disabled={write.isPending} onClick={() => setDeleting(false)}>Cancel</button>
      </div>}
      {write.error && <p role="alert" className="mt-2 text-sm text-danger">{write.error.message}</p>}
    </article>
  );
}
