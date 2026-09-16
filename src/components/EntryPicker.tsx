import { useLocation, useNavigate } from "react-router";
import { usePlayer } from "../lib/player.tsx";

/**
 * Who you are picking as, in the two places it changes anything.
 *
 * This used to be a chip in the header, next to the megaphone and the theme toggle, doing two jobs
 * at once: it named the entry *and* opened the account. So the one control that answered "who am
 * I" also held the passkey settings, and the megaphone beside it read as part of the same cluster.
 * It is now a row of names above the picks and above the board — the two screens where the answer
 * changes what you are looking at — and the account has a tab of its own.
 *
 * Drawn only when there is more than one name: a person with a single entry has nothing to choose
 * between and would only be told their own name, which the pick flow says anyway.
 *
 * Switching keeps you on the same screen — you are usually comparing two entries on the same week,
 * and being thrown elsewhere loses your place. Exactly one piece of route state goes stale: the
 * pick flow keeps its step in the query, and "you just locked in" is emphatically not true of the
 * entry you switched to. Everything else in the query describes the *screen* rather than the
 * player — the board's sort, for one — so it stays.
 */
export function EntryPicker() {
  const { player, people, switchTo } = usePlayer();
  const loc = useLocation();
  const nav = useNavigate();
  if (people.length < 2) return null;

  const pick = (id: string) => {
    if (id === player?.id) return;
    switchTo(id);
    const next = new URLSearchParams(loc.search);
    if (!next.has("step")) return;
    next.delete("step");
    const query = next.toString();
    nav(`${loc.pathname}${query ? `?${query}` : ""}`, { replace: true });
  };

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Picking as">
      <span className="text-xs font-bold uppercase tracking-wider text-ink-3">Picking as</span>
      {people.map((p) => {
        const active = p.id === player?.id;
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={active}
            aria-label={`Pick as ${p.name}`}
            onClick={() => pick(p.id)}
            className={`font-display min-h-9 rounded-full border-2 border-ink px-3 py-1 text-sm font-bold transition-colors ${
              active ? "bg-ink text-paper" : "bg-surface text-ink hover:bg-paper-2"
            }`}
          >
            {p.name}
          </button>
        );
      })}
    </div>
  );
}
