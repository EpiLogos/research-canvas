import { useCallback, useState } from "react";

import { CanvasView } from "@research-canvas/canvas";

import { useCanvasWorkspace } from "./CanvasWorkspaceContext";
import { WorkspaceFilePickerButton } from "./WorkspaceFilePickerButton";

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
  const [localAnnotationMode, setLocalAnnotationMode] = useState(false);

  // Use external drawingMode if provided (controlled from Shell), otherwise fall back to local state
  const annotationMode = drawingMode || localAnnotationMode;
  void strokeColour; // threaded from Shell for future per-stroke colour support

  const createAnnotation = useCallback((points: Parameters<
    ReturnType<typeof workspace.annotationStore.getState>["createStrokeAnnotation"]
  >[0]["points"]) => {
    workspace.annotationStore.getState().createStrokeAnnotation({
      points,
      strokeKind: "stroke"
    });
    setLocalAnnotationMode(false);
  }, [workspace.annotationStore]);

  if (!workspace.isHydrated) {
    return (
      <div className="canvas-workspace">
        <p>{workspace.errorMessage ?? "Loading canvas workspace."}</p>
      </div>
    );
  }

  const fileEntries = (workspace.entries ?? []).map((entry) => ({
    id: entry.id,
    name: entry.name,
    path: entry.relativePath,
    kind: entry.kind
  }));

  return (
    <div className="canvas-workspace">
      <div className="canvas-stage">
        <div className="canvas-chrome">
          <header className="canvas-toolbar">
            <div className="canvas-toolbar__group">
              <button onClick={() => workspace.createNoteNode()} type="button">
                Add note node
              </button>
              <WorkspaceFilePickerButton
                buttonLabel="Add resource node"
                entries={workspace.entries}
                onSelect={(entry) => {
                  workspace.addResourceNode(entry, { x: 200, y: 200 });
                }}
              />
            </div>

            <div className="canvas-toolbar__group">
              <button
                aria-pressed={localAnnotationMode}
                onClick={() => setLocalAnnotationMode((value) => !value)}
                type="button"
              >
                Draw annotation
              </button>
            </div>
          </header>

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
              workspace.createNoteNode(position);
            }}
            onCreateGroup={(position) => {
              workspace.createGroupNode(position);
            }}
            onConnectNodes={(input) => {
              workspace.addEdge(input);
            }}
            onReconnectEdge={(edgeId, input) => {
              workspace.store.getState().updateEdgeConnection(edgeId, input);
            }}
            onCycleEdgeDirectionality={(edgeId) => {
              workspace.store.getState().cycleEdgeDirectionality(edgeId);
            }}
            onDeleteEdge={(edgeId) => {
              workspace.deleteEdge(edgeId);
            }}
            onUpdateEdgeRelationKind={(edgeId, relationKind) => {
              workspace.store.getState().updateEdgeRelationKind(edgeId, relationKind);
            }}
            onResizeNode={(nodeId, width, height) => {
              workspace.resizeNode(nodeId, width, height);
            }}
            onCreateResourceFromFile={(entry, position) => {
              workspace.addResourceNode(entry, position);
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
