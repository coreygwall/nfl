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
 * **Two shapes, by how many names there are.** Up to three, a row of chips: every name is one tap
 * and the active one is obvious. Past that it is one control — the current name and a menu —
 * because a row of twelve chips wraps to three lines and pushes the picks it is about off the
 * screen, and at that count nobody is scanning for a name anyway; they are looking for *theirs*.
 *
 * Switching keeps you on the same screen — you are usually comparing two entries on the same week,
 * and being thrown elsewhere loses your place. Exactly one piece of route state goes stale: the
 * pick flow keeps its step in the query, and "you just locked in" is emphatically not true of the
 * entry you switched to. Everything else in the query describes the *screen* rather than the
 * player — the board's sort, for one — so it stays.
 */
export const CHIP_LIMIT = 3;

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

  if (people.length > CHIP_LIMIT) {
    return (
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label htmlFor="entry-picker" className="text-xs font-bold uppercase tracking-wider text-ink-3">
          Picking as
        </label>
        {/* A native select: the one menu every phone draws well, and the one a screen reader
            already knows how to read. Styled as the chip it replaces, with the chevron drawn in. */}
        <span className="relative inline-flex">
          <select
            id="entry-picker"
            value={player?.id ?? ""}
            onChange={(e) => pick(e.target.value)}
            className="font-display min-h-9 cursor-pointer appearance-none rounded-full border-2 border-ink bg-ink py-1 pl-3 pr-8 text-sm font-bold text-paper"
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <svg aria-hidden="true" viewBox="0 0 16 16" className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-paper">
            <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="text-xs text-ink-3">{people.length} entries</span>
      </div>
    );
  }

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
