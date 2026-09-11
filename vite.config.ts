import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import { execSync } from "node:child_process";

const persistPath = process.env.PERSIST_STATE_PATH;

function buildId(): string {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "local";
  } catch {
    return `local-${Date.now().toString(36)}`;
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cloudflare(persistPath ? { persistState: { path: persistPath } } : undefined),
  ],
  define: { __BUILD_ID__: JSON.stringify(process.env.BUILD_ID ?? buildId()) },
  server: { port: 5173, strictPort: false },
});
