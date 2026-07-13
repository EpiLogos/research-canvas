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
      <section className="reader-surface reader-surface--lens" data-testid="reading-pane">
        <div className="reader-surface__empty">Select a node to read</div>
      </section>
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
