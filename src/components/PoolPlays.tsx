import { POOL_TYPES } from "../../shared/pools.ts";

/**
 * Joining a pool, starting one, and what else Tally plays.
 *
 * One copy, three doors into it: the lockup's sheet, the account page and the fold at the bottom
 * of Home. It used to be written out twice in slightly different words, which is how the sheet
 * came to say a pool link was the only way in while Home said the same thing one paragraph
 * longer.
 *
 * Why there is nothing to paste: on the web a pool *is* an address. The Worker serving this page
 * serves exactly one pool, so another pool is another host, and opening its link is the whole act
 * of joining — there is no list here to switch between. The iOS app can hold several at once
 * because it keeps its own catalogue and talks to each host in turn; a browser tab cannot.
 */
export function PoolPlays() {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="card-flat bg-surface p-4">
        <h3 className="font-display font-extrabold">Join a pool</h3>
        <p className="text-sm text-ink-2">
          Open the link your commissioner sent. Every pool lives at its own address, so the link is the way in — and
          this one stays exactly as it is.
        </p>
      </div>
      <div className="card-flat bg-surface p-4">
        <h3 className="font-display font-extrabold">
          Start a pool <span className="chip ml-1 bg-paper-2 py-0 text-[10px]">coming soon</span>
        </h3>
        <p className="text-sm text-ink-2">Pick a game, name it, share one link.</p>
      </div>
      {POOL_TYPES.map((t) => (
        <div key={t.slug} className="card-flat bg-surface p-4">
          <h3 className="font-display font-extrabold">
            {t.name}{" "}
            <span className={`chip ml-1 py-0 text-[10px] ${t.status === "live" ? "bg-turf text-on-turf" : "bg-paper-2"}`}>
              {t.status === "live" ? "live now" : "coming soon"}
            </span>
          </h3>
          <p className="text-sm text-ink-2">{t.blurb}</p>
        </div>
      ))}
    </div>
  );
}
