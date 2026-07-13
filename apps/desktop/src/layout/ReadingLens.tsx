import type { CanvasNode } from "@research-canvas/schema";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";
import { NodeReaderBody } from "../features/viewer/NodeReaderBody";
import { GraphDocumentAuthoringActions } from "../features/viewer/GraphDocumentContent";
import {
  readerRecordFromCanvasNode,
  type ReaderRecord,
} from "../features/viewer/readerRecord";
import { ReaderSurface, type ReaderSurfaceVariant } from "../features/viewer/ReaderSurface";

export function ReadingLens({
  onFullScreen,
  onExitToCanvas,
  variant = "lens",
  nodeOverride = null,
  recordOverride = null,
}: {
  onFullScreen: (record: ReaderRecord) => void;
  onExitToCanvas: () => void;
  variant?: "lens" | "overlay";
  nodeOverride?: CanvasNode | null;
  recordOverride?: ReaderRecord | null;
}) {
  const workspace = useCanvasWorkspace();
  const selectedNode = nodeOverride ?? workspace.nodes.find((n) => n.id === workspace.selectedNodeId) ?? null;
  const record = recordOverride ?? (selectedNode ? readerRecordFromCanvasNode(selectedNode) : null);

  if (!record) {
    return (
      <>
        {variant === "overlay" ? (
          <button
            type="button"
            className="reader-surface__scrim"
            data-testid="reader-scrim"
            aria-label="Dismiss reading backdrop"
            onClick={onExitToCanvas}
          />
        ) : null}
        <section
          className={`reader-surface reader-surface--${variant}`}
          data-testid={variant === "overlay" ? "reading-overlay" : "reading-pane"}
          role={variant === "overlay" ? "dialog" : undefined}
          aria-modal={variant === "overlay" ? "true" : undefined}
          aria-label={variant === "overlay" ? "Node reading" : undefined}
        >
          <div className="reader-surface__empty">Select a node to read</div>
        </section>
      </>
    );
  }

  return (
    <ReaderSurface
      record={record}
      workspaceRoot={workspace.workingRoot}
      variant={variant as ReaderSurfaceVariant}
      onExit={onExitToCanvas}
      onFullScreen={() => onFullScreen(record)}
      actions={record.graphNodeId ? <GraphDocumentAuthoringActions graphNodeId={record.graphNodeId} /> : undefined}
    >
      <NodeReaderBody node={record.canvasNode} record={record} affordances={false} />
    </ReaderSurface>
  );
}
