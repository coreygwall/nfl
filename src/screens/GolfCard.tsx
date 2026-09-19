import { useState } from "react";
import { Link, useParams } from "react-router";
import { motion } from "motion/react";
import { useSharedCard } from "../api/golf.ts";
import { ErrorState, Spinner } from "../components/Common.tsx";
import { Flag, Grid, Pencil, Trophy } from "../components/Icons.tsx";
import { ThemeToggle } from "../components/ThemeControl.tsx";
import { EditCardSheet } from "../components/golf/EditCard.tsx";
import { RoundTab } from "../components/golf/Round.tsx";
import { ScorecardTab } from "../components/golf/Scorecard.tsx";
import { TallyTab } from "../components/golf/Tally.tsx";
import { isComplete, strokesTaken, throughHole, toParText, toPar } from "../../shared/golf.ts";

/**
 * A golf card, opened from its link.
 *
 * This is the app's second shell on the web, and it is deliberately **not** the pool's. The rule
 * is the one `docs/navigation.md` sets for iOS — the tabs belong to the contest you are standing
 * in — and it applies here for a harder reason: a person holding this link may have no pool, no
 * account and no idea what Tally is. Drawing them Home · Picks · Board · Account would be four
 * doors, three of which lead nowhere they can go.
 *
 * So the frame is the same *grammar* as `AppShell` — a header with the mark and the name, a row of
 * tabs inline on a desktop and fixed to the bottom on a phone, the same pill sliding under the
 * active one — with the golf card's own three: Round · Tally · Scorecard. Account is not among
 * them because there is no account; the card's own settings live behind the pencil, which is where
 * the app keeps them too.
 *
 * There is no way *out* of a card and that is correct. The link is the whole entrance: somebody
 * arrived here from a group chat, and a tab bar offering to take them to a football pool they are
 * not in would be the web equivalent of a pop-up.
 */
export type GolfTab = "round" | "tally" | "scorecard";

export function GolfCard({ tab }: { tab: GolfTab }) {
  const { token = "" } = useParams();
  const shared = useSharedCard(token);
  const [editing, setEditing] = useState(false);
  const { card } = shared;

  if (shared.status === "loading" && !card) {
    return (
      <div className="mx-auto w-full max-w-[720px] px-4 py-16">
        <Spinner label="Opening the card…" />
      </div>
    );
  }

  if (shared.status === "missing" || (shared.status === "error" && !card)) {
    return <NoCard message={shared.error} onRetry={shared.status === "error" ? shared.retry : undefined} />;
  }
  if (!card) return <NoCard message={shared.error} onRetry={shared.retry} />;

  const base = `/g/${token}`;
  const tabs: { to: string; value: GolfTab; label: string; icon: React.ReactNode }[] = [
    { to: base, value: "round", label: "Round", icon: <Flag /> },
    { to: `${base}/tally`, value: "tally", label: "Tally", icon: <Trophy /> },
    { to: `${base}/scorecard`, value: "scorecard", label: "Scorecard", icon: <Grid /> },
  ];

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-[1180px] flex-col">
      <header className="app-header sticky top-0 z-30 bg-paper/90 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-3 sm:px-6 sm:py-3.5 lg:px-8">
          {/* The golf badge, not the tally mark and not the football: the mark says which family
              the contest you are standing in belongs to, and this one is a card. */}
          <div className="flex min-w-0 shrink-0 items-center gap-2.5">
            <img src="/golf.svg" alt="" className="h-10 w-10 shrink-0 sm:h-11 sm:w-11" />
            <span className="flex min-w-0 flex-col leading-none">
              <span className="font-display truncate text-[1.35rem] font-extrabold tracking-tight sm:text-[1.6rem]">
                {card.name}
              </span>
              <span className="mt-1 truncate text-[0.68rem] font-bold uppercase tracking-[0.16em] text-ink-2 sm:text-[0.72rem]">
                {card.course || "Golf card"}
              </span>
            </span>
          </div>
          <nav className="ml-4 hidden items-center gap-1 md:flex" aria-label="Card navigation">
            {tabs.map((t) => (
              <Link
                key={t.value}
                to={t.to}
                aria-current={t.value === tab ? "page" : undefined}
                className={`relative isolate z-0 flex items-center gap-2 rounded-full px-4 py-1.5 font-display text-[15px] font-bold ${
                  t.value === tab ? "text-paper" : "text-ink-2 hover:text-ink"
                }`}
              >
                {t.value === tab && (
                  <motion.span
                    layoutId="golf-top-nav-pill"
                    className="absolute inset-0 -z-10 rounded-full bg-ink"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
                {t.icon}
                {t.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
            <SaveLight saving={shared.saving} offline={shared.offline} />
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-surface hover:bg-paper-2"
              aria-label="Names, pars and stakes"
              onClick={() => setEditing(true)}
            >
              <Pencil size={18} />
            </button>
            <ThemeToggle className="hidden md:flex" />
          </div>
        </div>
        <ScoreStrip card={card} />
      </header>

      <main className="flex-1 px-4 pb-28 pt-4 sm:px-6 md:pb-12 lg:px-8">
        <div className="mx-auto w-full max-w-[720px]">
          {tab === "round" && <RoundTab shared={shared} card={card} />}
          {tab === "tally" && <TallyTab card={card} base={base} />}
          {tab === "scorecard" && <ScorecardTab card={card} base={base} />}
        </div>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 md:hidden" aria-label="Card navigation">
        <div className="mx-auto max-w-[560px] px-4 pb-[max(env(safe-area-inset-bottom),12px)]">
          <div className="card flex p-1.5">
            {tabs.map((t) => (
              <Link
                key={t.value}
                to={t.to}
                aria-current={t.value === tab ? "page" : undefined}
                className={`relative isolate z-0 flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-2xl py-2.5 font-display text-[13px] font-bold transition-colors sm:gap-1.5 sm:text-[15px] ${
                  t.value === tab ? "text-paper" : "text-ink hover:bg-paper-2"
                }`}
              >
                {t.value === tab && (
                  <motion.span
                    layoutId="golf-nav-pill"
                    className="pointer-events-none absolute inset-0 -z-10 rounded-2xl bg-ink"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                    aria-hidden="true"
                  />
                )}
                {t.icon}
                {t.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>

      {editing && <EditCardSheet card={card} apply={shared.apply} onClose={() => setEditing(false)} />}
    </div>
  );
}

/**
 * Where the round stands, under the header on every tab.
 *
 * It is a strip rather than a card on the Round tab because the answer to "what are we?" is wanted
 * on the scorecard and the tally too, and asking for it should never cost a tab change.
 */
function ScoreStrip({ card }: { card: Parameters<typeof strokesTaken>[0] }) {
  const through = throughHole(card);
  return (
    <div className="flex items-center gap-4 border-t-2 border-line px-4 py-2 sm:px-6 lg:px-8">
      <span className="font-display text-xl font-extrabold tabular">{toParText(toPar(card))}</span>
      <span className="text-xs font-bold uppercase tracking-wider text-ink-3">
        {through === 0 ? "not started" : isComplete(card) ? "final" : `through ${through}`}
      </span>
      <span className="ml-auto text-xs font-bold uppercase tracking-wider text-ink-3">
        {strokesTaken(card)} strokes
      </span>
    </div>
  );
}

/**
 * The one honest word about the network.
 *
 * A card is edited by several people at once over a patchy course signal, so "did that save?" is a
 * real question with a real answer. It says nothing at all when there is nothing to say — a
 * permanent green tick is decoration, and decoration is what makes a warning invisible.
 */
function SaveLight({ saving, offline }: { saving: boolean; offline: boolean }) {
  if (offline) {
    return (
      <span className="chip border-danger bg-danger-soft text-xs" role="status">
        Not saved — retrying
      </span>
    );
  }
  if (!saving) return null;
  return (
    <span className="chip text-xs text-ink-2" role="status">
      Saving…
    </span>
  );
}

/**
 * A link that goes nowhere.
 *
 * Worth being specific about: the two ways to land here are a mistyped link and a card that has
 * been taken down, and neither is the reader's fault. There is nothing to sign into and nothing to
 * search, so the only useful thing this page can do is say so plainly and point at the one person
 * who can fix it — whoever sent the link.
 */
function NoCard({ message, onRetry }: { message: string | null; onRetry?: () => void }) {
  return (
    <div className="mx-auto w-full max-w-[520px] px-4 py-16">
      <ErrorState
        message={message ?? "That card isn't here. Check the link, or ask whoever sent it for a fresh one."}
        onRetry={onRetry}
      />
      <p className="mt-6 text-center text-sm text-ink-2">
        Golf cards are only reachable by their link — there's nothing to search.{" "}
        <Link to="/" className="underline">
          What Tally is
        </Link>
      </p>
    </div>
  );
}
