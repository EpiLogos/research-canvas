import { defineConfig, devices } from "@playwright/test";

const port = 4173;
// The public-viewer dev server serves the offline palace bundle e2e
// (palace-viewer.spec.ts): it mounts the shared PalaceSurface read-only.
const publicViewerPort = 4174;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000
  },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "on-first-retry",
    // Headless Chromium ships with WebGL2 disabled. The Places globe needs a
    // WebGL2 context to render, so force software WebGL (SwiftShader) — this
    // makes the offline-globe e2e a real render proof rather than a vacuous
    // pass over a never-initialized map.
    launchOptions: {
      args: ["--enable-webgl", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
    }
  },
  webServer: [
    {
      command: `pnpm --filter @research-canvas/desktop dev --host 127.0.0.1 --port ${port}`,
      port,
      reuseExistingServer: !process.env.CI
    },
    {
      command: `pnpm --filter @research-canvas/public-viewer dev --host 127.0.0.1 --port ${publicViewerPort}`,
      port: publicViewerPort,
      reuseExistingServer: !process.env.CI
    }
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});

