import { useEffect, useMemo, useState } from "react";

import type { ExportBundle } from "@research-canvas/schema";

import { buildExportManifest } from "@research-canvas/exporter";

import { MobileFallback } from "./routes/MobileFallback";
import { IndexView } from "./routes/IndexView";
import { NodePage } from "./routes/NodePage";
import { SequenceView } from "./routes/SequenceView";
import { StoryView } from "./routes/StoryView";
import { readBootstrappedBundle } from "./OfflineBootstrap";

interface AppProps {
  bundle?: ExportBundle | null;
}

export function App({ bundle: bundleProp = null }: AppProps) {
  const bundle = useViewerBundle(bundleProp);
  const manifest = useMemo(() => (bundle ? buildExportManifest(bundle) : null), [bundle]);
  const isMobile = useIsMobile();

  if (!bundle || !manifest) {
    return (
      <main className="viewer viewer--loading">
        <p>Loading export…</p>
      </main>
    );
  }

  const route = getViewerRoute();
  if (route.type === "node") {
    return <NodePage bundle={bundle} nodeId={route.id} />;
  }

  if (route.type === "sequence") {
    return <SequenceView bundle={bundle} />;
  }

  if (route.type === "story") {
    return <StoryView />;
  }

  if (isMobile) {
    return <MobileFallback bundle={bundle} />;
  }

  return <IndexView bundle={bundle} manifest={manifest} />;
}

function useViewerBundle(bundle: ExportBundle | null) {
  const [resolvedBundle, setResolvedBundle] = useState<ExportBundle | null>(() => {
    return bundle ?? readBootstrappedBundle();
  });

  useEffect(() => {
    if (bundle) {
      setResolvedBundle(bundle);
      return;
    }

    const bootstrapped = readBootstrappedBundle();
    if (bootstrapped) {
      setResolvedBundle(bootstrapped);
      return;
    }

    let cancelled = false;
    void fetch("bundle.json")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`bundle.json request failed with status ${response.status}`);
        }

        return (await response.json()) as ExportBundle;
      })
      .then((nextBundle) => {
        if (!cancelled) {
          setResolvedBundle(nextBundle);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedBundle(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bundle]);

  return resolvedBundle;
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(getViewportIsMobile);

  useEffect(() => {
    const updateViewport = () => setIsMobile(getViewportIsMobile());
    window.addEventListener("resize", updateViewport);
    updateViewport();
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  return isMobile;
}

function getViewportIsMobile() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.innerWidth <= 760;
}

function getViewerRoute() {
  if (typeof window === "undefined") {
    return { type: "map" as const };
  }

  const path = window.location.pathname.replace(/\/+$/, "");
  const nodeMatch = path.match(/\/nodes\/([^/]+)$/);
  if (nodeMatch) {
    return { id: decodeURIComponent(nodeMatch[1]), type: "node" as const };
  }

  const sequenceMatch = path.match(/\/sequences\/([^/]+)$/);
  if (sequenceMatch) {
    return { id: decodeURIComponent(sequenceMatch[1]), type: "sequence" as const };
  }

  if (path.startsWith("/stories") || path.startsWith("/story")) {
    return { type: "story" as const };
  }

  return { type: "map" as const };
}
