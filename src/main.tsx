import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/inter";
import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import App from "./App.tsx";
import { PlayerProvider } from "./lib/player.tsx";
import { ToastProvider } from "./components/Toast.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { BASENAME } from "./lib/basename.ts";

// After a deploy, an open tab may try to load a chunk that no longer exists. Reload once
// to pick up the new build instead of showing a broken screen.
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  const key = "nflpool.reloaded-for-preload-error";
  try {
    if (sessionStorage.getItem(key) === __BUILD_ID__) return;
    sessionStorage.setItem(key, __BUILD_ID__);
  } catch {
    /* ignore */
  }
  window.location.reload();
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 20_000, refetchOnWindowFocus: true, retry: 1 },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={BASENAME}>
        <MotionConfig reducedMotion="user">
          <ToastProvider>
            <PlayerProvider>
              <App />
            </PlayerProvider>
          </ToastProvider>
        </MotionConfig>
      </BrowserRouter>
    </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
