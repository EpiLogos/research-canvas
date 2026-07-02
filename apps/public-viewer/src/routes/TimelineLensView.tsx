import { useEffect, useMemo, useState } from "react";

import type { GraphExportBundle } from "@research-canvas/exporter";
import type { GraphNode } from "@research-canvas/desktop-api";
import { createStaticBundleTransport } from "@research-canvas/desktop-api";

interface TimelineLensViewProps {
  bundle: GraphExportBundle;
}

function yearOf(node: GraphNode): string {
  if (!node.validFrom) {
    return "";
  }
  return node.validFrom.slice(0, 4);
}

export function TimelineLensView({ bundle }: TimelineLensViewProps) {
  const transport = useMemo(() => createStaticBundleTransport(bundle), [bundle]);
  const [litIds, setLitIds] = useState<Set<string>>(() => new Set());

  // The timeline projection (isTemporal nodes, ordered by validFrom) is derived
  // synchronously from the bundle itself — it must be present on first paint,
  // not gated behind an async transport round-trip. `loadCanvasView` still runs
  // (kept for parity/consistency with the live desktop lens and to exercise the
  // WorkspaceTransport contract), but the read-layer's list rendering never
  // waits on it.
  useEffect(() => {
    void transport.loadCanvasView({ canvasId: bundle.canvasId, lens: "timeline" });
  }, [transport, bundle.canvasId]);

  const operators = useMemo(
    () => bundle.nodes.filter((node) => !node.isTemporal),
    [bundle.nodes]
  );

  const events = useMemo(
    () =>
      bundle.nodes
        .filter((node) => node.isTemporal)
        .slice()
        .sort((left, right) => (left.validFrom ?? "").localeCompare(right.validFrom ?? "")),
    [bundle.nodes]
  );

  const lightOperator = async (operatorGraphNodeId: string) => {
    const lighting = await transport.archetypalLighting({ operatorGraphNodeId });
    setLitIds(new Set(lighting.instances.map((instance) => instance.node.graphNodeId)));
  };

  return (
    <main className="viewer viewer--timeline">
      <header className="viewer__hero">
        <p className="eyebrow">Timeline lens (read-only)</p>
        <h1>{bundle.project.displayName}</h1>
      </header>

      <section className="viewer__section" aria-label="Lighting sources">
        <header className="viewer__section-header">
          <p className="eyebrow">Lighting sources</p>
          <h2>Trans-temporal operators</h2>
        </header>
        <div className="viewer__operator-row">
          {operators.map((operator) => (
            <button
              className="viewer__operator"
              data-testid={`operator-${operator.graphNodeId}`}
              key={operator.graphNodeId}
              onClick={() => {
                void lightOperator(operator.graphNodeId);
              }}
              type="button"
            >
              {operator.title}
            </button>
          ))}
        </div>
      </section>

      <section className="viewer__section">
        <header className="viewer__section-header">
          <p className="eyebrow">Axis</p>
          <h2>Temporally-located nodes</h2>
        </header>
        <ol className="viewer__timeline-axis">
          {events.map((node) => (
            <li
              className="viewer__timeline-event"
              data-lit={litIds.has(node.graphNodeId) ? "true" : "false"}
              data-testid={`timeline-event-${node.graphNodeId}`}
              key={node.graphNodeId}
            >
              <span className="viewer__timeline-date">{yearOf(node)}</span>
              <span className="viewer__timeline-title">{node.title}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
