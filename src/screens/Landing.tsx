import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Sheet } from "../components/AppShell.tsx";
import { HowToPlay } from "../components/HowToPlay.tsx";
import { POOL_TYPES, type PoolTypeContent } from "../../shared/pools.ts";
import { CompactThemeSelect } from "../components/ThemeControl.tsx";

/**
 * playtally.app itself: what Tally is, how a pool works, and what is coming. Deliberately links
 * to no live pool — you get into one from the link your commissioner sent you, not from here.
 */
const HOW_IT_WORKS = [
  {
    title: "Pick a pool",
    body: "Choose the game you want to run and the season it follows. Everything else is set up for you.",
  },
  {
    title: "Share the link",
    body: "One link to the group chat. Your friends type a name and they're playing — nothing to install.",
  },
  {
    title: "Watch the board",
    body: "Scores land as games finish. Standings, bragging rights, and a running record of who called it.",
  },
];

const FACTS = ["Set up in a minute", "Just a name to join", "Works on any phone"];

export function Landing() {
  const [open, setOpen] = useState<PoolTypeContent | null>(null);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b-2 border-ink bg-paper/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1080px] items-center gap-2.5 px-5 py-3 sm:px-8 sm:py-3.5">
          <img src="/icon.svg" alt="" className="h-10 w-10 shrink-0 sm:h-11 sm:w-11" />
          <span className="font-display text-[1.55rem] font-extrabold leading-none tracking-tight sm:text-[1.8rem]">Tally</span>
          <span className="ml-auto hidden text-[13px] font-bold text-ink-2 sm:inline">iOS app coming soon</span>
          <CompactThemeSelect showLabel />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1080px] flex-1 px-5 sm:px-8">
        <section className="pb-12 pt-12 sm:pb-16 sm:pt-20">
          <span className="chip bg-flag font-display text-[13px] font-extrabold">Free to play</span>
          <h1 className="font-display mt-5 max-w-[19ch] text-[clamp(2.5rem,6.4vw,4rem)] font-extrabold leading-[0.98] tracking-tight">
            Simple, fun games to play with your friends.
          </h1>
          <p className="mt-5 max-w-[46ch] text-[clamp(1.05rem,2.4vw,1.3rem)] leading-snug text-ink-2">
            Tally hosts the pools you already argue about — and a few you haven't tried yet. Pick a game, share one
            link, and everyone's in. Nothing to install, nothing to keep in a spreadsheet.
          </p>
          <ul className="mt-6 flex flex-wrap gap-2">
            {FACTS.map((fact) => (
              <li key={fact} className="chip">
                {fact}
              </li>
            ))}
          </ul>
        </section>

        <section className="border-t-2 border-dashed border-line py-12 sm:py-16">
          <h2 className="font-display text-[clamp(1.5rem,4vw,2rem)] font-extrabold tracking-tight">How it works</h2>
          <p className="mt-2 max-w-[56ch] text-ink-2">You run it, your friends play it. That's the whole thing.</p>
          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            {HOW_IT_WORKS.map((step, index) => (
              <li key={step.title} className="card-flat p-5">
                <span className="font-display text-xs font-extrabold uppercase tracking-[0.1em] text-ink-3">
                  Step {index + 1}
                </span>
                <h3 className="font-display mt-1 text-lg font-extrabold">{step.title}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-t-2 border-dashed border-line py-12 sm:py-16">
          <h2 className="font-display text-[clamp(1.5rem,4vw,2rem)] font-extrabold tracking-tight">Pools</h2>
          <p className="mt-2 max-w-[56ch] text-ink-2">One is live today. More are on the way. Tap one to see how it plays.</p>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {POOL_TYPES.map((pool) => (
              <li key={pool.slug} className="flex">
                <PoolCard pool={pool} onOpen={() => setOpen(pool)} />
              </li>
            ))}
          </ul>
        </section>

        <section className="border-t-2 border-dashed border-line py-12 sm:py-16">
          <h2 className="font-display text-[clamp(1.5rem,4vw,2rem)] font-extrabold tracking-tight">Already in a pool?</h2>
          <p className="mt-2 max-w-[56ch] text-ink-2">
            Open the link your commissioner sent you. It remembers you after the first visit, on that phone or laptop,
            so you never have to sign in again.
          </p>
        </section>
      </main>

      <footer className="border-t-2 border-ink">
        <div className="mx-auto flex w-full max-w-[1080px] flex-wrap items-center gap-x-6 gap-y-2 px-5 py-8 pb-12 sm:px-8">
          <span className="font-display text-xl font-extrabold tracking-tight">Tally</span>
          <span className="text-sm text-ink-2">Pools to play with your friends.</span>
          <span className="text-sm text-ink-2 sm:ml-auto">iOS app coming soon.</span>
        </div>
      </footer>

      <AnimatePresence>
        {open && (
          <Sheet key={open.slug} title={open.name} size="lg" onClose={() => setOpen(null)}>
            <PoolDetail pool={open} />
          </Sheet>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatusTag({ status }: { status: PoolTypeContent["status"] }) {
  const live = status === "live";
  return (
    <span
      className={`font-display rounded-full border-2 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.06em] ${
        live ? "border-turf bg-turf text-on-turf" : "border-ink bg-paper-2 text-ink-2"
      }`}
    >
      {live ? "Live now" : "Coming soon"}
    </span>
  );
}

function PoolCard({ pool, onOpen }: { pool: PoolTypeContent; onOpen: () => void }) {
  const live = pool.status === "live";
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      whileHover={{ y: -3 }}
      whileTap={{ y: 0 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={`flex w-full flex-col items-start gap-2 p-5 text-left ${live ? "card" : "card-flat opacity-80"}`}
    >
      <span className="flex flex-wrap items-center gap-2.5">
        <span className="font-display text-xl font-extrabold">{pool.name}</span>
        <StatusTag status={pool.status} />
      </span>
      <span className="text-[15px] leading-relaxed text-ink-2">{pool.blurb}</span>
      <span className="mt-1 flex flex-wrap gap-1.5">
        {pool.sports.map((sport) => (
          <span key={sport} className="rounded-full border border-dashed border-line px-2.5 py-0.5 text-[13px] text-ink-2">
            {sport}
          </span>
        ))}
      </span>
      <span className="font-display mt-2 text-sm font-bold text-turf">How it plays →</span>
    </motion.button>
  );
}

function PoolDetail({ pool }: { pool: PoolTypeContent }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5">
        <StatusTag status={pool.status} />
        {pool.sports.map((sport) => (
          <span key={sport} className="rounded-full border border-dashed border-line px-2.5 py-0.5 text-[13px] text-ink-2">
            {sport}
          </span>
        ))}
      </div>
      <p className="mt-3 text-base leading-snug text-ink-2">{pool.tagline}</p>
      {pool.steps.length > 0 ? (
        <div className="mt-6">
          <HowToPlay pool={pool} compact />
        </div>
      ) : (
        <p className="mt-4 text-[15px] leading-relaxed text-ink-2">{pool.blurb} Not open yet — it's next on the list.</p>
      )}
    </div>
  );
}
