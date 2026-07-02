import type { GraphNode } from "@research-canvas/desktop-api";
import { BlockNoteReadOnly } from "@research-canvas/viewers";

interface GraphNodeReaderProps {
  node: GraphNode;
  onClose: () => void;
}

/**
 * Read-only reader overlay for a graph node opened from either lens
 * (onOpenNode). Reuses the SHARED BlockNoteReadOnly (WS3) to render the node's
 * BlockNote body — no editor runtime, no new node view. Mirrors the desktop's
 * FullScreenReader "node" mode conceptually, but backed by the static bundle.
 */
export function GraphNodeReader({ node, onClose }: GraphNodeReaderProps) {
  return (
    <div
      className="viewer__reader-overlay"
      data-testid="graph-node-reader"
      role="dialog"
      aria-label={node.title}
    >
      <header className="viewer__hero">
        <p className="eyebrow">{node.entityType}</p>
        <h1>{node.title}</h1>
        {node.summary ? <p>{node.summary}</p> : null}
        <button type="button" onClick={onClose} data-testid="graph-node-reader-close">
          Close
        </button>
      </header>
      <BlockNoteReadOnly body={node.body} />
    </div>
  );
}
