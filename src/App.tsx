import { Navigate, Route, Routes, useLocation } from "react-router";
import type { ReactNode } from "react";
import { useBootstrap } from "./api/queries.ts";
import { usePlayer } from "./lib/player.tsx";
import { AppShell } from "./components/AppShell.tsx";
import { ChromeProvider } from "./components/Chrome.tsx";
import { Welcome } from "./screens/Welcome.tsx";
import { PickFlow } from "./screens/PickFlow.tsx";
import { Board } from "./screens/Board.tsx";
import { Home } from "./screens/Home.tsx";
import { Account } from "./screens/Account.tsx";
import { Commissioner } from "./screens/Commissioner.tsx";
import { League } from "./screens/League.tsx";
import { Rules } from "./screens/Rules.tsx";
import { Privacy } from "./screens/Privacy.tsx";
import { Landing } from "./screens/Landing.tsx";
import { GolfCard } from "./screens/GolfCard.tsx";
import { POOL_SLUG } from "./lib/basename.ts";
import { Announcements } from "./components/Announcements.tsx";
import { fallbackPoolWeeks } from "./lib/poolFallback.ts";

/**
 * The root of a pool is Home now rather than a redirect into this week's picks. Landing straight on
 * the pick screen was right while the app *was* one pool; it stops being right the moment there is
 * more than one, and it was never able to say "your picks are in, here's where you stand".
 */
function PoolHome() {
  return <Home />;
}

function BoardIndex() {
  const boot = useBootstrap();
  const { search } = useLocation();
  const fallback = fallbackPoolWeeks();
  // Carry ?sort= through the redirect, so a shared board link keeps its view.
  return <Navigate to={`/board/week/${boot.data?.boardWeek ?? fallback.boardWeek}${search}`} replace />;
}

/**
 * The pick flow keeps its own state — which teams are tapped, which step you are on — so it has to
 * start over when you switch to another entry. It used to be remounted by accident: switching
 * navigated to "/", which bounced through a redirect back to the same week. Now that switching
 * leaves you where you are, the identity is the key, exactly as it is on iOS.
 */
function PickFlowRoute() {
  const { player } = usePlayer();
  return <PickFlow key={player?.id ?? "-"} />;
}

function RequirePlayer({ children }: { children: ReactNode }) {
  const { player } = usePlayer();
  const loc = useLocation();
  if (!player) return <Navigate to={`/welcome?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return children;
}

export default function App() {
  // The bare domain is Tally's own front door; a pool only exists under /p/<slug>.
  //
  // A golf card is neither. It lives at /g/<token> off the root because it is not *in* a pool —
  // the link is the whole entrance and the person holding it may have no account at all — and it
  // draws its own shell rather than the pool's `AppShell`, with the card's three tabs instead of
  // a pool's four. Matched before the landing page's catch-all, or a shared link would bounce to
  // a page about football.
  if (!POOL_SLUG) {
    return (
      <Routes>
        <Route index element={<Landing />} />
        <Route path="g/:token" element={<GolfCard tab="round" />} />
        <Route path="g/:token/tally" element={<GolfCard tab="tally" />} />
        <Route path="g/:token/scorecard" element={<GolfCard tab="scorecard" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }
  return (
    <ChromeProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<PoolHome />} />
          <Route path="welcome" element={<Welcome />} />
          <Route path="rules" element={<Rules />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="announcements" element={<Announcements />} />
          <Route
            path="week/:week"
            element={
              <RequirePlayer>
                <PickFlowRoute />
              </RequirePlayer>
            }
          />
          <Route path="account" element={<RequirePlayer><Account /></RequirePlayer>} />
          <Route path="board" element={<BoardIndex />} />
          <Route path="board/week/:week" element={<Board tab="week" />} />
          <Route path="board/season" element={<Board tab="season" />} />
          {/* Two different offices: a pool's, and the league's. `/admin` was both. */}
          <Route path="commissioner" element={<Commissioner />} />
          <Route path="league" element={<League />} />
          <Route path="admin" element={<Navigate to="/commissioner" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ChromeProvider>
  );
}
