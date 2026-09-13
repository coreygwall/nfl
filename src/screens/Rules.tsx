import { Link } from "react-router";
import { useBootstrap } from "../api/queries.ts";
import { HowToPlay } from "../components/HowToPlay.tsx";
import { HIGH_FIVE } from "../../shared/pools.ts";
import { usePlayer } from "../lib/player.tsx";

export function Rules() {
  const boot = useBootstrap();
  const { player } = usePlayer();
  // The pool's own name if the commissioner gave it one, otherwise the pool type's.
  const name = boot.data?.poolName ?? HIGH_FIVE.name;
  return (
    <div className="mx-auto w-full max-w-[920px]">
      <header className="max-w-[620px]">
        <p className="font-display text-xs font-extrabold uppercase tracking-[0.16em] text-turf">Three easy steps</p>
        <h1 className="font-display mt-1 text-3xl font-extrabold tracking-tight lg:text-4xl">How to play {name}</h1>
        <p className="mt-2 text-base leading-snug text-ink-2">{HIGH_FIVE.tagline}</p>
      </header>

      <div className="mt-6">
        <HowToPlay pool={HIGH_FIVE} inApp />
      </div>

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
