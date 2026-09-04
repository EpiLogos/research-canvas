import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
  },
  optimizeDeps: {
    // maplibre-gl spawns a module worker (`maplibre-gl-worker.mjs`) whose URL
    // breaks when Vite pre-bundles the library into .vite/deps. Excluding it
    // serves the source module so Vite rewrites the worker URL correctly (the
    // dev-server dep-optimizer warning + `net::ERR_FAILED` both come from
    // pre-bundling). Production build is unaffected (optimizeDeps is dev-only).
    exclude: ["maplibre-gl"],
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@research-canvas/canvas/styles/shell.css": fileURLToPath(
        new URL("../../packages/canvas/src/styles/shell.css", import.meta.url),
      ),
      "@research-canvas/canvas": fileURLToPath(
        new URL("../../packages/canvas/src/index.ts", import.meta.url),
      ),
      "@research-canvas/desktop-api": fileURLToPath(
        new URL("../../packages/desktop-api/src/index.ts", import.meta.url),
      ),
      "@research-canvas/exporter": fileURLToPath(
        new URL("../../packages/exporter/src/index.ts", import.meta.url),
      ),
      "@research-canvas/search": fileURLToPath(
        new URL("../../packages/search/src/index.ts", import.meta.url),
      ),
      "@research-canvas/schema": fileURLToPath(
        new URL("../../packages/schema/src/index.ts", import.meta.url),
      ),
      "@research-canvas/viewers": fileURLToPath(
        new URL("../../packages/viewers/src/index.ts", import.meta.url),
      ),
      "@research-canvas/node-document": fileURLToPath(
        new URL("../../packages/node-document/src/index.ts", import.meta.url),
      )
    }
  }
});
