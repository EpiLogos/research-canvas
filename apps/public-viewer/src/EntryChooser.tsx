import { useEffect, useState } from "react";

import { parseLegacyGraphExportBundle } from "@research-canvas/exporter";
import type { GraphExportBundle } from "@research-canvas/exporter";

import { App } from "./App";
import { GraphApp } from "./GraphApp";
import { readBootstrappedGraphBundle } from "./OfflineBootstrap";

type Choice =
  | { kind: "pending" }
  | { kind: "graph"; bundle: GraphExportBundle }
  | { kind: "legacy" };

/**
 * Chooses the web entry: the two-lens GraphApp when a graph bundle is present
 * (an inlined window.__RESEARCH_CANVAS_GRAPH_BUNDLE__ or a fetchable
 * graph-bundle.json), otherwise the legacy ExportBundle App. GraphApp is the
 * canonical web viewer — it renders the SHARED TimelineLens/CanvasView. The
 * legacy App is only a fallback for bundles that predate the graph export.
 */
export function EntryChooser() {
  const [choice, setChoice] = useState<Choice>(() => {
    const bootstrapped = readBootstrappedGraphBundle();
    return bootstrapped ? { kind: "graph", bundle: bootstrapped } : { kind: "pending" };
  });

  useEffect(() => {
    if (choice.kind !== "pending") {
      return;
    }

    let cancelled = false;
    void fetch("graph-bundle.json")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`graph-bundle.json request failed with status ${response.status}`);
        }
        return parseLegacyGraphExportBundle(await response.json());
      })
      .then((bundle) => {
        if (!cancelled) {
          setChoice({ kind: "graph", bundle });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChoice({ kind: "legacy" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [choice.kind]);

  if (choice.kind === "graph") {
    return <GraphApp bundle={choice.bundle} />;
  }

  if (choice.kind === "legacy") {
    return <App />;
  }

  return (
    <main className="viewer viewer--loading">
      <p>Loading export…</p>
    </main>
  );
}
