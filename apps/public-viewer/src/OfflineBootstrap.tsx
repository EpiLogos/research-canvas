import type { ExportBundle } from "@research-canvas/schema";

declare global {
  interface Window {
    __RESEARCH_CANVAS_BUNDLE__?: ExportBundle;
  }
}

export function readBootstrappedBundle() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.__RESEARCH_CANVAS_BUNDLE__ ?? null;
}

export function OfflineBootstrap({ bundle }: { bundle: ExportBundle }) {
  return (
    <script
      id="research-canvas-bundle"
      type="application/json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(bundle) }}
    />
  );
}
