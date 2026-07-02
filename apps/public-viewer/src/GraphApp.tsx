import { useEffect, useState } from "react";

import type { GraphExportBundle } from "@research-canvas/exporter";
import { parseGraphExportBundle } from "@research-canvas/exporter";

import { CanvasLensView } from "./routes/CanvasLensView";
import { TimelineLensView } from "./routes/TimelineLensView";
import { readBootstrappedGraphBundle } from "./OfflineBootstrap";

type Lens = "canvas" | "timeline";

interface GraphAppProps {
  bundle?: GraphExportBundle | null;
}

export function GraphApp({ bundle: bundleProp = null }: GraphAppProps) {
  const bundle = useGraphBundle(bundleProp);
  const [lens, setLens] = useState<Lens>("canvas");

  if (!bundle) {
    return (
      <main className="viewer viewer--loading">
        <p>Loading export…</p>
      </main>
    );
  }

  return (
    <div className="viewer-shell">
      <nav className="viewer-shell__lens-switch" aria-label="Lens">
        <button
          aria-pressed={lens === "canvas"}
          onClick={() => setLens("canvas")}
          type="button"
        >
          Canvas
        </button>
        <button
          aria-pressed={lens === "timeline"}
          onClick={() => setLens("timeline")}
          type="button"
        >
          Timeline
        </button>
      </nav>
      {lens === "canvas" ? (
        <CanvasLensView bundle={bundle} />
      ) : (
        <TimelineLensView bundle={bundle} />
      )}
    </div>
  );
}

function useGraphBundle(bundle: GraphExportBundle | null) {
  const [resolved, setResolved] = useState<GraphExportBundle | null>(
    () => bundle ?? readBootstrappedGraphBundle()
  );

  useEffect(() => {
    if (bundle) {
      setResolved(bundle);
      return;
    }

    const bootstrapped = readBootstrappedGraphBundle();
    if (bootstrapped) {
      setResolved(bootstrapped);
      return;
    }

    let cancelled = false;
    void fetch("graph-bundle.json")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`graph-bundle.json request failed with status ${response.status}`);
        }
        return parseGraphExportBundle(await response.json());
      })
      .then((next) => {
        if (!cancelled) {
          setResolved(next);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolved(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bundle]);

  return resolved;
}
