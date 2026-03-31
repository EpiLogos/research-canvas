import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@research-canvas/exporter": fileURLToPath(
        new URL("../../packages/exporter/src/index.ts", import.meta.url)
      ),
      "@research-canvas/schema": fileURLToPath(
        new URL("../../packages/schema/src/index.ts", import.meta.url)
      ),
      "@research-canvas/viewers": fileURLToPath(
        new URL("../../packages/viewers/src/index.ts", import.meta.url)
      )
    }
  }
});
