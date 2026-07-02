import { useEffect, useMemo, useState } from "react";

import type { GraphExportBundle } from "@research-canvas/exporter";
import type { CanvasView } from "@research-canvas/desktop-api";
import { createStaticBundleTransport } from "@research-canvas/desktop-api";

interface CanvasLensViewProps {
  bundle: GraphExportBundle;
}

export function CanvasLensView({ bundle }: CanvasLensViewProps) {
  const transport = useMemo(() => createStaticBundleTransport(bundle), [bundle]);
  const [view, setView] = useState<CanvasView | null>(null);

  useEffect(() => {
    let cancelled = false;
    void transport
      .loadCanvasView({ canvasId: bundle.canvasId, lens: "canvas" })
      .then((next) => {
        if (!cancelled) {
          setView(next);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [transport, bundle.canvasId]);

  if (!view) {
    return (
      <main className="viewer viewer--canvas">
        <p>Loading canvas…</p>
      </main>
    );
  }

  return (
    <main className="viewer viewer--canvas">
      <header className="viewer__hero">
        <p className="eyebrow">Canvas lens (read-only)</p>
        <h1>{bundle.project.displayName}</h1>
      </header>
      <div className="viewer__canvas-surface" data-testid="canvas-surface">
        {view.nodes.map(({ node, layout }) => (
          <article
            className="viewer__canvas-node"
            data-entity-type={node.entityType}
            data-testid={`canvas-node-${node.graphNodeId}`}
            key={node.graphNodeId}
            style={{
              position: "absolute",
              left: `${layout.positionX}px`,
              top: `${layout.positionY}px`,
              width: `${layout.width}px`,
              height: `${layout.height}px`
            }}
          >
            <h3>{node.title}</h3>
            <p>{node.summary || node.entityType}</p>
          </article>
        ))}
      </div>
    </main>
  );
}
