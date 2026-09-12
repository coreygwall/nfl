import { Link } from "react-router";
import { useBootstrap } from "../api/queries.ts";
import { RankBadge } from "../components/Common.tsx";
import { usePlayer } from "../lib/player.tsx";

const rows: [string, string][] = [
  ["Each week", "Pick the winner of five games. Any five. Then rank them 1 to 5 by how sure you are."],
  ["Scoring", "A correct pick scores by its rank: 5, 4, 3, 2, 1. Miss and it's zero. Nail all five for 15."],
  ["No weekly deadline", "Every game locks at its own kickoff and nothing else does. Change any pick until its game starts."],
  ["Showing up late", "Missed the early games? Pick from what's left. Two games left means two picks, still worth 5 and 4."],
  ["After kickoff", "A pick on a started game is frozen: team and rank. Other people's picks stay hidden until that game kicks off."],
  ["Ties", "A tied game scores zero for everyone who picked it."],
  ["Standings", "Most points wins. Ties break on correct picks, then on 5-point hits."],
  ["Results", "The commissioner enters winners after each game, usually the same night."],
  ["Your name", "That's your login. This phone remembers it. On another device, just tap your name again."],
];

export function Rules() {
  const boot = useBootstrap();
  const { player } = usePlayer();
  const name = boot.data?.poolName ?? "High Five";
  return (
    <div className="mx-auto w-full max-w-[640px] lg:max-w-[980px]">
      <header className="sm:flex sm:items-end sm:justify-between sm:gap-6">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight lg:text-4xl">How {name} works</h1>
          <div className="mt-3 flex items-center gap-2" aria-hidden>
            {[1, 2, 3, 4, 5].map((r) => (
              <RankBadge key={r} rank={r} size="sm" />
            ))}
            <span className="text-xs font-semibold text-ink-3">points by rank</span>
          </div>
        </div>
        <div className="hidden gap-2 sm:flex sm:flex-wrap">
          <Link className="btn btn-sm btn-primary" to={player ? "/" : "/welcome"}>
            {player ? "Make my picks" : "Join the pool"}
          </Link>
          <Link className="btn btn-sm" to="/board">
            See the board
          </Link>
        </div>
      </header>
      <dl className="mt-5 grid gap-3 md:grid-cols-2 lg:gap-4">
        {rows.map(([term, body]) => (
          <div key={term} className="card-flat bg-white px-4 py-3">
            <dt className="font-display text-[15px] font-extrabold">{term}</dt>
            <dd className="mt-0.5 text-sm leading-snug text-ink-2">{body}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 flex flex-wrap gap-2 sm:hidden">
        <Link className="btn btn-primary" to={player ? "/" : "/welcome"}>
          {player ? "Make my picks" : "Join the pool"}
        </Link>
        <Link className="btn" to="/board">
          See the board
        </Link>
      </div>
    </div>
  );
}
