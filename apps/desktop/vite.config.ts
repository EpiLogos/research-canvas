import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
  },
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@research-canvas/canvas": fileURLToPath(
        new URL("../../packages/canvas/src/index.ts", import.meta.url),
      ),
      "@research-canvas/desktop-api": fileURLToPath(
        new URL("../../packages/desktop-api/src/index.ts", import.meta.url),
      ),
      "@research-canvas/search": fileURLToPath(
        new URL("../../packages/search/src/index.ts", import.meta.url),
      ),
      "@research-canvas/schema": fileURLToPath(
        new URL("../../packages/schema/src/index.ts", import.meta.url),
      ),
      "@research-canvas/viewers": fileURLToPath(
        new URL("../../packages/viewers/src/index.ts", import.meta.url),
      )
    }
  }
});
