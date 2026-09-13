import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify("test") },
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["test/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: "./wrangler.jsonc" },
            miniflare: {
              bindings: { ENVIRONMENT: "dev", ADMIN_PIN: "1234", POOL_NAME: "Test Pool", APPLE_APP_IDS: "ABCDE12345.app.playtally.ios, bad-id" },
            },
          }),
        ],
        test: {
          name: "worker",
          include: ["test/worker/**/*.test.ts"],
          // These drive the real Worker over dozens of round trips against a real SQLite, so the
          // 5s default is a stopwatch on the runner rather than a statement about the code: the
          // slowest here takes ~0.7s locally and tipped over the edge on a shared CI box.
          testTimeout: 30_000,
        },
      },
    ],
  },
});
