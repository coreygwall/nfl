import { defineConfig } from "@playwright/test";
import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The suite drives time with `?now=`, which the Worker only honours when ENVIRONMENT=dev, and
// signs into /admin with the dev PIN. Both live in .dev.vars, which is gitignored — so a fresh
// clone (CI included) gets the committed defaults rather than silently running as production.
const root = path.dirname(fileURLToPath(import.meta.url));
if (!existsSync(path.join(root, ".dev.vars"))) {
  copyFileSync(path.join(root, ".dev.vars.example"), path.join(root, ".dev.vars"));
}

// The sandbox and CI may carry a Chromium that predates this Playwright release.
const executablePath = process.env.PW_CHROMIUM_PATH ?? ["/opt/pw-browsers/chromium"].find((p) => existsSync(p));
const PORT = 5174;
// Fresh local D1 for every run.
const persist = mkdtempSync(path.join(tmpdir(), "nfl-pool-e2e-"));

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Playwright's default action timeout is *infinite*, which turns one un-clickable button into
    // a ninety-second test timeout naming whatever `finally` block the clock happened to land in
    // rather than the control it was waiting on. A bound well under the test budget means a click
    // on something disabled says that it was disabled.
    actionTimeout: 15_000,
    viewport: { width: 390, height: 844 },
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    command: `npx vite dev --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 90_000,
    env: { PERSIST_STATE_PATH: persist },
  },
});
