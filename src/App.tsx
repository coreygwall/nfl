import { Navigate, Route, Routes, useLocation } from "react-router";
import type { ReactNode } from "react";
import { useBootstrap } from "./api/queries.ts";
import { usePlayer } from "./lib/player.tsx";
import { AppShell } from "./components/AppShell.tsx";
import { ChromeProvider } from "./components/Chrome.tsx";
import { ErrorState, Spinner } from "./components/Common.tsx";
import { Welcome } from "./screens/Welcome.tsx";
import { PickFlow } from "./screens/PickFlow.tsx";
import { Board } from "./screens/Board.tsx";
import { Commissioner } from "./screens/Commissioner.tsx";
import { League } from "./screens/League.tsx";
import { Rules } from "./screens/Rules.tsx";
import { Landing } from "./screens/Landing.tsx";
import { POOL_SLUG } from "./lib/basename.ts";

function Home() {
  const { player } = usePlayer();
  const boot = useBootstrap();
  if (!player) return <Navigate to="/welcome" replace />;
  if (boot.isPending) return <Spinner />;
  if (boot.error) return <ErrorState message={boot.error.message} onRetry={() => boot.refetch()} />;
  return <Navigate to={`/week/${boot.data.currentWeek}`} replace />;
}

function BoardIndex() {
  const boot = useBootstrap();
  const { search } = useLocation();
  if (boot.isPending) return <Spinner />;
  if (boot.error) return <ErrorState message={boot.error.message} onRetry={() => boot.refetch()} />;
  // Carry ?sort= through the redirect, so a shared board link keeps its view.
  return <Navigate to={`/board/week/${boot.data.boardWeek}${search}`} replace />;
}

function RequirePlayer({ children }: { children: ReactNode }) {
  const { player } = usePlayer();
  const loc = useLocation();
  if (!player) return <Navigate to={`/welcome?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return children;
}

export default function App() {
  // The bare domain is Tally's own front door; a pool only exists under /p/<slug>.
  if (!POOL_SLUG) {
    return (
      <Routes>
        <Route index element={<Landing />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }
  return (
    <ChromeProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Home />} />
          <Route path="welcome" element={<Welcome />} />
          <Route path="rules" element={<Rules />} />
          <Route
            path="week/:week"
            element={
              <RequirePlayer>
                <PickFlow />
              </RequirePlayer>
            }
          />
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
