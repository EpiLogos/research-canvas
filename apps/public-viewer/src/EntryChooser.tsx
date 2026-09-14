import { useEffect, useState } from "react";

import { parseLegacyGraphExportBundle } from "@research-canvas/exporter";
import type { GraphExportBundle } from "@research-canvas/exporter";

import { App } from "./App";
import { GraphApp } from "./GraphApp";
import { readBootstrappedGraphBundle } from "./OfflineBootstrap";
import { validatePalaceBundle } from "@research-canvas/canvas";
import type { PalaceBundle } from "@research-canvas/canvas";
import { PalaceApp, readBootstrappedPalaceBundle } from "./palace/PalaceApp";

type Choice =
  | { kind: "pending" }
  | { kind: "graph"; bundle: GraphExportBundle }
  | { kind: "palace"; bundle: PalaceBundle }
  | { kind: "legacy" };

/**
 * Chooses the web entry:
 * 1. `/palace` routes to the 3D mind-palace viewer (PalaceApp) when a palace
 *    bundle is present (inlined window.__RESEARCH_CANVAS_PALACE_BUNDLE__ or a
 *    fetchable palace-bundle.json).
 * 2. Otherwise the two-lens GraphApp wins when a graph bundle is present.
 * 3. The legacy ExportBundle App is the fallback for bundles that predate the
 *    graph export.
 * GraphApp is the canonical web viewer for the two-lens surfaces; PalaceApp
 * renders the shared PalaceSurface read-only.
 */
export function EntryChooser() {
  const [choice, setChoice] = useState<Choice>(() => {
    if (isPalaceRoute()) {
      const bootstrapped = readBootstrappedPalaceBundle();
      return bootstrapped ? { kind: "palace", bundle: bootstrapped } : { kind: "pending" };
    }
    const bootstrapped = readBootstrappedGraphBundle();
    return bootstrapped ? { kind: "graph", bundle: bootstrapped } : { kind: "pending" };
  });

  useEffect(() => {
    if (choice.kind !== "pending") {
      return;
    }

    let cancelled = false;
    const preferPalace = isPalaceRoute();

    if (preferPalace) {
      fetchPalaceBundle()
        .then((bundle) => {
          if (!cancelled && bundle) {
            setChoice({ kind: "palace", bundle });
          } else if (!cancelled) {
            setChoice({ kind: "legacy" });
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
    }

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
      .catch(async () => {
        // No graph bundle: a palace-only export still renders — fall through
        // to the 3D mind palace before giving up on the legacy bundle.
        const palace = await fetchPalaceBundle();
        if (!cancelled && palace) {
          setChoice({ kind: "palace", bundle: palace });
        } else if (!cancelled) {
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

  if (choice.kind === "palace") {
    return <PalaceApp bundle={choice.bundle} />;
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

function isPalaceRoute() {
  if (typeof window === "undefined") {
    return false;
  }
  const path = window.location.pathname.replace(/\/+$/, "");
  return path === "/palace" || path.startsWith("/palace/");
}

async function fetchPalaceBundle(): Promise<PalaceBundle | null> {
  const bootstrapped = readBootstrappedPalaceBundle();
  if (bootstrapped) {
    return bootstrapped;
  }
  const response = await fetch("palace-bundle.json");
  if (!response.ok) {
    return null;
  }
  return validatePalaceBundle(await response.json());
}
