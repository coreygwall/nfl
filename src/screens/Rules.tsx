import { Link } from "react-router";
import { useBootstrap } from "../api/queries.ts";
import { RankBadge } from "../components/Common.tsx";
import { usePlayer } from "../lib/player.tsx";

const steps = [
  {
    title: "Pick 5 winners",
    body: "Choose any five games you think you can call correctly. You can change each pick until that game kicks off.",
  },
  {
    title: "Rank your confidence",
    body: "Your surest pick is worth 5 points, then 4, 3, 2, and 1. Put the most points behind the picks you trust most.",
  },
  {
    title: "Climb the board",
    body: "A correct pick earns its assigned points. A miss earns zero. Get all five right and you score the full 15.",
  },
];

const notes: [string, string][] = [
  ["No weekly deadline", "Games lock one at a time at kickoff, so later games stay open."],
  ["Showing up late is okay", "Pick from the games that are left. Your first remaining pick is still worth 5 points."],
  ["Picks stay private", "Other players' picks appear only after those games begin."],
  ["Season standings", "Most points wins. Ties break on correct picks, then 5-point hits."],
  ["Using another device?", "Tap “I already entered” and choose your name. No password needed."],
  ["What about an NFL tie?", "A tied game scores zero for everyone who picked it."],
];

export function Rules() {
  const boot = useBootstrap();
  const { player } = usePlayer();
  const name = boot.data?.poolName ?? "High Five";
  return (
    <div className="mx-auto w-full max-w-[920px]">
      <header className="max-w-[620px]">
        <p className="font-display text-xs font-extrabold uppercase tracking-[0.16em] text-turf">Three easy steps</p>
        <h1 className="font-display mt-1 text-3xl font-extrabold tracking-tight lg:text-4xl">How to play {name}</h1>
        <p className="mt-2 text-base leading-snug text-ink-2">Pick five. Rank your confidence. Score up to 15 points every week.</p>
      </header>

      <ol className="mt-6 grid gap-4 md:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="card bg-white p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-flag font-display text-lg font-extrabold" aria-hidden="true">
              {index + 1}
            </span>
            <h2 className="font-display mt-4 text-xl font-extrabold">{step.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{step.body}</p>
            {index === 1 && (
              <div className="mt-4 flex items-center gap-1.5" role="img" aria-label="Confidence values: 5, 4, 3, 2, and 1 points">
                {[1, 2, 3, 4, 5].map((rank) => (
                  <RankBadge key={rank} rank={rank} size="sm" />
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>

      <section className="mt-8" aria-labelledby="good-to-know">
        <h2 id="good-to-know" className="font-display text-2xl font-extrabold">Good to know</h2>
        <dl className="mt-3 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {notes.map(([term, body]) => (
            <div key={term} className="border-t-2 border-ink pt-3">
              <dt className="font-display text-[15px] font-extrabold">{term}</dt>
              <dd className="mt-1 text-sm leading-snug text-ink-2">{body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-8 flex flex-wrap gap-2">
        <Link className="btn btn-primary" to={player ? "/" : "/welcome"}>
          {player ? "Back to my picks" : "Join the pool"}
        </Link>
        <Link className="btn" to="/board">
          View the board
        </Link>
      </div>
    </div>
  );
}
