import { useCallback } from "react";

import { CanvasView } from "@research-canvas/canvas";

import { useCanvasWorkspace } from "./CanvasWorkspaceContext";

interface CanvasScreenProps {
  onNodeSelect?: (nodeId: string) => void;
  onNodeDoubleClick?: (nodeId: string) => void;
  onPlaySequence?: () => void;
  leftPanelOpen?: boolean;
  rightPanelOpen?: boolean;
  drawingMode?: boolean;
  strokeColour?: string;
}

export function CanvasScreen({ onNodeSelect, onNodeDoubleClick, onPlaySequence, leftPanelOpen, rightPanelOpen, drawingMode = false, strokeColour = "#f97316" }: CanvasScreenProps) {
  const workspace = useCanvasWorkspace();

  const annotationMode = drawingMode;
  void strokeColour; // threaded from Shell for future per-stroke colour support

  const createAnnotation = useCallback((points: Parameters<
    ReturnType<typeof workspace.annotationStore.getState>["createStrokeAnnotation"]
  >[0]["points"]) => {
    workspace.annotationStore.getState().createStrokeAnnotation({
      points,
      strokeKind: "stroke"
    });
  }, [workspace.annotationStore]);

  if (!workspace.isHydrated) {
    return (
      <div className="canvas-workspace">
        <p>{workspace.errorMessage ?? "Loading canvas workspace."}</p>
      </div>
    );
  }

  const fileEntries = (workspace.entries ?? []).map((entry) => ({
    absolutePath: entry.absolutePath,
    id: entry.id,
    name: entry.name,
    path: entry.relativePath,
    kind: entry.kind,
    relativePath: entry.relativePath
  }));

  return (
    <div className="canvas-workspace">
      <div className="canvas-stage">
        <div className="canvas-chrome">
          {workspace.errorMessage ? (
            <p className="canvas-status" role="status">
              {workspace.errorMessage}
            </p>
          ) : null}
        </div>

        <div className="canvas-layer-stack">
          <CanvasView
            edges={workspace.edges}
            nodes={workspace.nodes}
            selectedEdgeId={workspace.selectedEdgeId}
            selectedNodeId={workspace.selectedNodeId}
            onMoveNode={(nodeId, position) => {
              workspace.store.getState().updateNodePosition(nodeId, position);
            }}
            onSelectNode={(nodeId) => {
              workspace.selectNode(nodeId);
              if (nodeId) {
                onNodeSelect?.(nodeId);
              }
            }}
            onSelectEdge={(edgeId) => {
              workspace.selectEdge(edgeId);
            }}
            onNodeDoubleClick={(nodeId) => {
              workspace.selectNode(nodeId);
              onNodeDoubleClick?.(nodeId);
            }}
            onDeleteNode={(nodeId) => {
              workspace.deleteNode(nodeId);
            }}
            onDuplicateNode={(nodeId) => {
              workspace.duplicateNode(nodeId);
            }}
            onCreateNote={(position) => {
              void workspace.createNoteNode(position);
            }}
            onCreateGroup={(position) => {
              void workspace.createGroupNode(position);
            }}
            onConnectNodes={(input) => {
              void workspace.addEdge(input);
            }}
            onReconnectEdge={(edgeId, input) => {
              workspace.store.getState().updateEdgeConnection(edgeId, input);
            }}
            onCycleEdgeDirectionality={(edgeId) => {
              workspace.store.getState().cycleEdgeDirectionality(edgeId);
            }}
            onDeleteEdge={(edgeId) => {
              void workspace.deleteEdge(edgeId);
            }}
            onUpdateEdgeRelationKind={(edgeId, relationKind) => {
              void workspace.updateEdgeRelationKind(edgeId, relationKind);
            }}
            onResizeNode={(nodeId, width, height) => {
              workspace.resizeNode(nodeId, width, height);
            }}
            onCreateResourceFromFile={(entry, position) => {
              void workspace.addResourceNode(entry, position);
            }}
            fileEntries={fileEntries}
            leftPanelOpen={leftPanelOpen}
            rightPanelOpen={rightPanelOpen}
            onRegisterCaptureViewport={workspace.registerCaptureViewport}
            onRegisterFlyToEdge={workspace.registerFlyToEdge}
            onRegisterFlyToNode={workspace.registerFlyToNode}
            annotations={workspace.annotations}
            drawingEnabled={annotationMode}
            onCreateStroke={createAnnotation}
            onUpdateNoteContent={workspace.updateNodeContent}
            onToggleEdgeSequencing={(edgeId) => {
              workspace.store.getState().toggleEdgeSequencing(edgeId);
            }}
            onPlaySequence={onPlaySequence}
          />
        </div>

        <footer className="canvas-footer">
          <span>{workspace.nodes.length} nodes</span>
          <span>{workspace.edges.length} connections</span>
          <span data-testid="annotation-count">
            {workspace.annotations.length} annotations
          </span>
        </footer>
      </div>
    </div>
  );
}
