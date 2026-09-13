import { RankBadge } from "./Common.tsx";
import type { PoolTypeContent } from "../../shared/pools.ts";

/**
 * The body of a pool type's explanation: the numbered steps and the fine print. The pool's own
 * "How to play" page wraps this with a heading and buttons; the landing page opens it in a sheet.
 * `inApp` keeps instructions that only make sense once you are inside the pool off the landing page.
 */
export function HowToPlay({
  pool,
  inApp = false,
  compact = false,
}: {
  pool: PoolTypeContent;
  inApp?: boolean;
  /** Inside a dialog, where the pool's name is already the biggest thing on screen. */
  compact?: boolean;
}) {
  const notes = pool.notes.filter((note) => inApp || !note.appOnly);
  return (
    <>
      <ol className="grid gap-4 md:grid-cols-3">
        {pool.steps.map((step, index) => (
          <li key={step.title} className="card bg-white p-5">
            <span
              className="font-display flex h-9 w-9 items-center justify-center rounded-full bg-flag text-lg font-extrabold"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <h2 className="font-display mt-4 text-xl font-extrabold">{step.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{step.body}</p>
            {step.showRanks && (
              <div className="mt-4 flex items-center gap-1.5" role="img" aria-label="Confidence values: 5, 4, 3, 2, and 1 points">
                {[1, 2, 3, 4, 5].map((rank) => (
                  <RankBadge key={rank} rank={rank} size="sm" />
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>

      {notes.length > 0 && (
        <section className="mt-8" aria-labelledby={`good-to-know-${pool.slug}`}>
          <h2 id={`good-to-know-${pool.slug}`} className={`font-display font-extrabold ${compact ? "text-xl" : "text-2xl"}`}>
            Good to know
          </h2>
          <dl className="mt-3 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {notes.map((note) => (
              <div key={note.term} className="border-t-2 border-ink pt-3">
                <dt className="font-display text-[15px] font-extrabold">{note.term}</dt>
                <dd className="mt-1 text-sm leading-snug text-ink-2">{note.body}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </>
  );
}
