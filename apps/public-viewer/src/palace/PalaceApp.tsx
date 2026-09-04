import { useEffect, useMemo, useState } from "react";

import { PalaceSurface, validatePalaceBundle } from "@research-canvas/canvas";
import type { PalaceBundle, PalaceCuration, PalaceScene } from "@research-canvas/canvas";

declare global {
  interface Window {
    __RESEARCH_CANVAS_PALACE_BUNDLE__?: unknown;
  }
}

/**
 * The 3D mind palace in the offline public viewer. Reads the self-contained
 * palace-bundle.json (or an inlined window.__RESEARCH_CANVAS_PALACE_BUNDLE__)
 * and mounts the SHARED PalaceSurface in read-only mode — no curation
 * mutations, no persistence, just navigation, fly-to, recall, and entering
 * compressed constellations. WebGL2 is probed by the surface; when unavailable
 * it shows a clear error banner.
 */

interface PalaceAppProps {
  bundle?: PalaceBundle | null;
}

export function PalaceApp({ bundle: bundleProp = null }: PalaceAppProps) {
  const bundle = usePalaceBundle(bundleProp);
  const curation = useMemo(() => bundle?.curation ?? null, [bundle]);

  if (!bundle) {
    return (
      <main className="viewer viewer--loading">
        <p>Loading palace…</p>
      </main>
    );
  }

  // Read-only web layer: curation controls are hidden, saves are no-ops. If a
  // bundle was exported without a curation payload, synthesize a neutral one
  // from the scene rooms so the palace still renders.
  const resolvedCuration = curation ?? curationFromScene(bundle.scene);

  return (
    <PalaceSurface
      scene={bundle.scene}
      nodes={bundle.nodes}
      relationships={bundle.relationships}
      encapsulationEdges={bundle.encapsulationEdges}
      curation={resolvedCuration}
      readOnly
    />
  );
}

function curationFromScene(scene: PalaceScene): PalaceCuration {
  return {
    chambers: scene.rooms.map((room, index) => ({
      candidateId: room.id,
      anchorGraphNodeId: room.anchorGraphNodeId,
      title: room.title,
      pinned: false,
      excluded: false,
      position: index,
    })),
    objects: [],
    fixtures: [],
    collections: [],
  };
}

function usePalaceBundle(bundleProp: PalaceBundle | null) {
  const [resolved, setResolved] = useState<PalaceBundle | null>(() => {
    if (bundleProp) return bundleProp;
    return readBootstrappedPalaceBundle();
  });

  useEffect(() => {
    if (bundleProp) {
      setResolved(bundleProp);
      return;
    }

    const bootstrapped = readBootstrappedPalaceBundle();
    if (bootstrapped) {
      setResolved(bootstrapped);
      return;
    }

    let cancelled = false;
    void fetch("palace-bundle.json")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`palace-bundle.json request failed with status ${response.status}`);
        }
        return validatePalaceBundle(await response.json());
      })
      .then((nextBundle) => {
        if (!cancelled && nextBundle) {
          setResolved(nextBundle);
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
  }, [bundleProp]);

  return resolved;
}

export function readBootstrappedPalaceBundle(): PalaceBundle | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.__RESEARCH_CANVAS_PALACE_BUNDLE__;
  if (!raw) {
    return null;
  }
  return validatePalaceBundle(raw);
}
