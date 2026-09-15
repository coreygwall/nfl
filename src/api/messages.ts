import { useInfiniteQuery } from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import type { MessagesResponse, PoolMessage } from "../../shared/messages.ts";
import { usePlayer } from "../lib/player.tsx";
import { api } from "./client.ts";

/** One shared feed powers the header badge, home preview and full announcements page. */
export function useMessagesFeed() {
  const { player } = usePlayer();
  return useInfiniteQuery({
    queryKey: ["messages", player?.id ?? null],
    initialPageParam: "",
    queryFn: ({ pageParam }) => api<MessagesResponse>(`/messages${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ""}`),
    getNextPageParam: page => page.nextCursor ?? undefined,
    refetchInterval: 60_000,
  });
}

export function feedMessages(data: InfiniteData<MessagesResponse> | undefined): PoolMessage[] {
  return [...new Map((data?.pages ?? []).flatMap(page => page.messages).map(message => [message.id, message])).values()];
}
