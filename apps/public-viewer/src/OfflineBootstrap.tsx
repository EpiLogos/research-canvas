import type { ExportBundle } from "@research-canvas/schema";

import type { GraphExportBundle } from "@research-canvas/exporter";
import { parseLegacyGraphExportBundle } from "@research-canvas/exporter";

declare global {
  interface Window {
    __RESEARCH_CANVAS_BUNDLE__?: ExportBundle;
    __RESEARCH_CANVAS_GRAPH_BUNDLE__?: GraphExportBundle;
    __RESEARCH_CANVAS_PALACE_BUNDLE__?: unknown;
  }
}

export function readBootstrappedBundle() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.__RESEARCH_CANVAS_BUNDLE__ ?? null;
}

export function readBootstrappedGraphBundle(): GraphExportBundle | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.__RESEARCH_CANVAS_GRAPH_BUNDLE__;
  if (!raw) {
    return null;
  }

  return parseLegacyGraphExportBundle(raw);
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
