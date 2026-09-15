import { useCallback, useEffect, useState } from "react";
import type { PoolMessage } from "../../shared/messages.ts";
import { POOL_SLUG } from "./basename.ts";

const KEY = `nflpool.announcements.seen.v1:${POOL_SLUG ?? "default"}`;
const EVENT = "tally:announcements-read";

function readSeen(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function countUnread(messages: Pick<PoolMessage, "id">[], seenId: string | null): number {
  if (!messages.length) return 0;
  if (!seenId) return messages.length;
  const seenIndex = messages.findIndex(message => message.id === seenId);
  return seenIndex < 0 ? messages.length : seenIndex;
}

/** Device-local read state: switching family entries should not make the same announcement new. */
export function useAnnouncementRead(messages: Pick<PoolMessage, "id">[]) {
  const [seenId, setSeenId] = useState(readSeen);
  const latestId = messages[0]?.id;

  useEffect(() => {
    const sync = () => setSeenId(readSeen());
    const storage = (event: StorageEvent) => { if (event.key === KEY) sync(); };
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", storage);
    };
  }, []);

  const markRead = useCallback(() => {
    if (!latestId) return;
    try {
      localStorage.setItem(KEY, latestId);
    } catch {
      /* Private browsing may refuse storage; the current view can still update. */
    }
    setSeenId(latestId);
    window.dispatchEvent(new Event(EVENT));
  }, [latestId]);

  return { unread: countUnread(messages, seenId), markRead };
}
