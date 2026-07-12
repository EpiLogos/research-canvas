import { useEffect, useMemo, useState } from "react";

import { CanvasView, TimelineLens } from "@research-canvas/canvas";
import type { GraphExportBundle } from "@research-canvas/exporter";
import { parseLegacyGraphExportBundle } from "@research-canvas/exporter";
import { createStaticBundleTransport } from "@research-canvas/desktop-api";
import type { CanvasView as CanvasViewData, WorkspaceTransport } from "@research-canvas/desktop-api";
import type { CanvasEdge, CanvasNode } from "@research-canvas/schema";

import { canvasViewToCanvasNodes } from "./graph/canvasViewToNodes";
import { createTimelineDataSource } from "./graph/createTimelineDataSource";
import { GraphNodeReader } from "./graph/GraphNodeReader";
import { readBootstrappedGraphBundle } from "./OfflineBootstrap";

type Lens = "canvas" | "timeline";

interface GraphAppProps {
  bundle?: GraphExportBundle | null;
}

export function GraphApp({ bundle: bundleProp = null }: GraphAppProps) {
  const bundle = useGraphBundle(bundleProp);
  const [lens, setLens] = useState<Lens>("canvas");
  const [openNodeId, setOpenNodeId] = useState<string | null>(null);

  // One read-only WorkspaceTransport over the static bundle, shared by both
  // lenses. It provides exactly the read methods the shared views need
  // (loadCanvasView / archetypalLighting / resonancesForInstance) and rejects
  // every mutation — the web is structurally read-only.
  const transport = useMemo<WorkspaceTransport | null>(
    () => (bundle ? createStaticBundleTransport(bundle) : null),
    [bundle]
  );

  if (!bundle || !transport) {
    return (
      <main className="viewer viewer--loading">
        <p>Loading export…</p>
      </main>
    );
  }

  const openNode = bundle.nodes.find((node) => node.graphNodeId === openNodeId) ?? null;

  return (
    <div className="viewer-shell">
      <nav className="viewer-shell__lens-switch" aria-label="Lens" data-testid="lens-switch">
        <button
          aria-pressed={lens === "canvas"}
          data-testid="lens-switch-canvas"
          onClick={() => setLens("canvas")}
          type="button"
        >
          Canvas
        </button>
        <button
          aria-pressed={lens === "timeline"}
          data-testid="lens-switch-timeline"
          onClick={() => setLens("timeline")}
          type="button"
        >
          Timeline
        </button>
      </nav>

      {lens === "canvas" ? (
        <CanvasLens
          bundle={bundle}
          transport={transport}
          onOpenNode={setOpenNodeId}
        />
      ) : (
        <TimelineLensPane
          bundle={bundle}
          transport={transport}
          onOpenNode={setOpenNodeId}
        />
      )}

      {openNode ? (
        <GraphNodeReader node={openNode} onClose={() => setOpenNodeId(null)} />
      ) : null}
    </div>
  );
}

/**
 * Canvas lens — renders the SHARED <CanvasView> in read-only mode. Nodes/edges
 * are hydrated from transport.loadCanvasView({ lens: "canvas" }) and mapped to
 * the shared CanvasNode/CanvasEdge shape via the same mapper the desktop uses.
 * No mutation callbacks are passed, so dragging/editing persist nowhere; a
 * double-click routes to the read-only node reader.
 */
function CanvasLens({
  bundle,
  transport,
  onOpenNode,
}: {
  bundle: GraphExportBundle;
  transport: WorkspaceTransport;
  onOpenNode: (graphNodeId: string) => void;
}) {
  const [graph, setGraph] = useState<{ nodes: CanvasNode[]; edges: CanvasEdge[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void transport
      .loadCanvasView({ canvasId: bundle.canvasId, lens: "canvas" })
      .then((view: CanvasViewData) => {
        if (!cancelled) {
          setGraph(canvasViewToCanvasNodes(view));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [transport, bundle.canvasId]);

  if (!graph) {
    return (
      <main className="viewer viewer--canvas">
        <p>Loading canvas…</p>
      </main>
    );
  }

  return (
    <section className="viewer__canvas-surface" data-testid="canvas-surface">
      <CanvasView
        nodes={graph.nodes}
        edges={graph.edges}
        onNodeDoubleClick={onOpenNode}
      />
    </section>
  );
}

/**
 * Timeline lens — renders the SHARED <TimelineLens> backed by a
 * TimelineDataSource built from the read-only static-bundle transport. This is
 * byte-for-byte the same view code the desktop runs; only the data source
 * differs.
 */
function TimelineLensPane({
  bundle,
  transport,
  onOpenNode,
}: {
  bundle: GraphExportBundle;
  transport: WorkspaceTransport;
  onOpenNode: (graphNodeId: string) => void;
}) {
  const dataSource = useMemo(
    () => createTimelineDataSource({ transport, workspaceId: `static:${bundle.project.id}` }),
    [transport, bundle.project.id]
  );

  return (
    <section className="viewer__timeline-surface" data-testid="timeline-surface">
      <TimelineLens dataSource={dataSource} onOpenNode={onOpenNode} />
    </section>
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
        return parseLegacyGraphExportBundle(await response.json());
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
