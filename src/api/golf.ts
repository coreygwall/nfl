import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiClientError } from "./client.ts";
import { mergeCards, type ScrambleCard } from "../../shared/golf.ts";
import type { GolfCardResponse } from "../../shared/api.ts";

/**
 * One golf card, kept in step with everybody else's copy of it.
 *
 * The shape of the problem is not the pool's. A pool is read far more than it is written and every
 * write has one author; a card is four people round one hole, two of them holding phones, tapping
 * at the same moment about the same thing. So this is **local-first with a server merge**, and the
 * three rules that fall out of that are worth stating before the code:
 *
 * 1. **A tap changes the screen immediately.** Nobody standing on a tee waits for a round trip to
 *    see the name they just pressed. The edit lands in local state, and the network catches up.
 * 2. **The server's answer is the truth.** Every push comes back with the merged card — which can
 *    legitimately contain strokes this browser never logged — and that answer replaces what is on
 *    screen. A client that argued with it would be a client that can lose somebody's hole.
 * 3. **Local edits are never clobbered by a poll.** While anything is unsent, the poll's result is
 *    ignored: it is by definition older than what is in front of you. It is applied the moment the
 *    push that carries your edits has been acknowledged.
 *
 * Pushes are coalesced and serialised. Coalesced because finishing a hole is four taps in two
 * seconds and that is one request, not four; serialised because two PUTs in flight against one row
 * is a race with a stale winner.
 */

/** Long enough to swallow a burst of taps, short enough that a closed tab loses nothing real. */
const PUSH_DEBOUNCE_MS = 400;

/**
 * How often to look for somebody else's holes. A round is a four-hour event with a change every
 * couple of minutes, so this is generous rather than tight — and a push already returns the merged
 * card, which means the person doing things sees other people's work immediately anyway. The poll
 * is for the phone sitting idle in a cart holder.
 */
const POLL_MS = 12_000;

export type CardStatus = "loading" | "ready" | "missing" | "error";

export interface SharedCard {
  card: ScrambleCard | null;
  status: CardStatus;
  error: string | null;
  /** True while anything is unsent or in flight — the header's one honest "saving" light. */
  saving: boolean;
  /** Set when a push or poll failed and has not since succeeded. */
  offline: boolean;
  /** Apply a change locally and schedule it. The only way this hook is written to. */
  apply: (change: (card: ScrambleCard) => ScrambleCard) => void;
  retry: () => void;
}

export function useSharedCard(token: string): SharedCard {
  const [card, setCard] = useState<ScrambleCard | null>(null);
  const [status, setStatus] = useState<CardStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [offline, setOffline] = useState(false);

  /** The newest local card, readable from callbacks that were created before it existed. */
  const latest = useRef<ScrambleCard | null>(null);
  /** Local edits that have not been acknowledged. While true, a poll is stale by definition. */
  const unsent = useRef(false);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  /** Take the server's word for it, unless this browser is holding something it has not sent. */
  const adopt = useCallback((next: ScrambleCard, force: boolean) => {
    if (!alive.current) return;
    if (unsent.current && !force) return;
    latest.current = next;
    setCard(next);
    setStatus("ready");
    setOffline(false);
  }, []);

  const push = useCallback(async () => {
    if (inFlight.current || !latest.current) return;
    const sending = latest.current;
    inFlight.current = true;
    // Cleared *before* the request rather than after: an edit made while it is in the air has to
    // mark itself unsent again, or it would be swallowed by the response that does not contain it.
    unsent.current = false;
    try {
      const res = await api<GolfCardResponse>(`/golf/cards/${token}`, { method: "PUT", body: { card: sending } });
      // Anything tapped while that was in flight is still local-only, so the answer is merged into
      // it rather than over it — the server's holes, plus the ones this browser has not sent yet.
      const next = unsent.current && latest.current ? mergeCards(res.card, latest.current) : res.card;
      adopt(next, true);
    } catch (err) {
      // The edit is still in local state and still unsent, so the next attempt carries it.
      unsent.current = true;
      if (alive.current) {
        setOffline(true);
        if (err instanceof ApiClientError && err.status === 404) {
          setStatus("missing");
          setError("That card isn't here any more.");
        }
      }
    } finally {
      inFlight.current = false;
      if (!alive.current) return;
      if (unsent.current) {
        // Something arrived while that was in the air. Go again immediately: the debounce is for
        // a burst of taps, not for work that is already waiting.
        void push();
      } else {
        setSaving(false);
      }
    }
  }, [token, adopt]);

  const apply = useCallback(
    (change: (card: ScrambleCard) => ScrambleCard) => {
      const current = latest.current;
      if (!current) return;
      const next = change(current);
      if (next === current) return;
      latest.current = next;
      setCard(next);
      unsent.current = true;
      setSaving(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void push(), PUSH_DEBOUNCE_MS);
    },
    [push],
  );

  const load = useCallback(async () => {
    try {
      const res = await api<GolfCardResponse>(`/golf/cards/${token}`);
      adopt(res.card, latest.current === null);
    } catch (err) {
      if (!alive.current) return;
      setOffline(true);
      if (err instanceof ApiClientError && err.status === 404) {
        setStatus("missing");
        setError(err.message);
        return;
      }
      if (latest.current === null) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Couldn't load that card.");
      }
    }
  }, [token, adopt]);

  useEffect(() => {
    void load();
    const id = setInterval(() => {
      // Nothing to learn from a poll while a push is pending — and its answer would be stale.
      if (document.visibilityState === "visible" && !unsent.current && !inFlight.current) void load();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  /**
   * A phone goes in a pocket mid-round, and a browser is free to drop the tab when it does. Send
   * whatever is waiting the moment the page is hidden rather than trusting the debounce to outlive
   * it — the cost of getting this wrong is a hole somebody logged that nobody has.
   */
  useEffect(() => {
    const flush = () => {
      if (!unsent.current || inFlight.current) return;
      if (timer.current) clearTimeout(timer.current);
      void push();
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, [push]);

  const retry = useCallback(() => {
    setError(null);
    setStatus(latest.current ? "ready" : "loading");
    if (unsent.current) void push();
    else void load();
  }, [push, load]);

  return { card, status, error, saving, offline, apply, retry };
}
