import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@research-canvas/canvas": fileURLToPath(
        new URL("./packages/canvas/src/index.ts", import.meta.url),
      ),
      "@research-canvas/exporter": fileURLToPath(
        new URL("./packages/exporter/src/index.ts", import.meta.url),
      ),
      "@research-canvas/desktop-api": fileURLToPath(
        new URL("./packages/desktop-api/src/index.ts", import.meta.url),
      ),
      "@research-canvas/search": fileURLToPath(
        new URL("./packages/search/src/index.ts", import.meta.url),
      ),
      "@research-canvas/schema": fileURLToPath(
        new URL("./packages/schema/src/index.ts", import.meta.url),
      ),
      "@research-canvas/viewers": fileURLToPath(
        new URL("./packages/viewers/src/index.ts", import.meta.url),
      ),
      "@research-canvas/public-viewer": fileURLToPath(
        new URL("./apps/public-viewer/src/App.tsx", import.meta.url),
      )
    }
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: [
      "packages/**/*.test.ts",
      "packages/**/*.test.tsx",
      "apps/**/*.test.ts",
      "apps/**/*.test.tsx"
    ],
    setupFiles: ["./tests/setup/vitest.setup.ts"]
  }
});
