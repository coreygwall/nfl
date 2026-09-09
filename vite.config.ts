import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

const persistPath = process.env.PERSIST_STATE_PATH;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cloudflare(persistPath ? { persistState: { path: persistPath } } : undefined),
  ],
  server: { port: 5173, strictPort: false },
});
