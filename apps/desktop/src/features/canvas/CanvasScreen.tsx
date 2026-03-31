import { useCallback, useState } from "react";

import { AnnotationLayer, CanvasView } from "@research-canvas/canvas";

import { useCanvasWorkspace } from "./CanvasWorkspaceContext";

interface CanvasScreenProps {
  onNodeSelect?: (nodeId: string) => void;
  onNodeDoubleClick?: (nodeId: string) => void;
}

export function CanvasScreen({ onNodeSelect, onNodeDoubleClick }: CanvasScreenProps) {
  const workspace = useCanvasWorkspace();
  const [annotationMode, setAnnotationMode] = useState(false);

  const createAnnotation = useCallback((points: Parameters<
    ReturnType<typeof workspace.annotationStore.getState>["createStrokeAnnotation"]
  >[0]["points"]) => {
    workspace.annotationStore.getState().createStrokeAnnotation({
      points,
      strokeKind: "stroke"
    });
    setAnnotationMode(false);
  }, [workspace.annotationStore]);

  const createSequence = useCallback(() => {
    const existing = workspace.sequences[0];
    if (existing) {
      workspace.sequenceStore.getState().setActiveSequence(existing.id);
      return;
    }

    workspace.sequenceStore.getState().createSequence({
      kind: "storyboard",
      name: "Episode flow"
    });
  }, [workspace.sequenceStore, workspace.sequences]);

  if (!workspace.isHydrated) {
    return (
      <div className="canvas-workspace">
        <p>Loading canvas workspace.</p>
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
              <button
                onClick={() => {
                  const entry =
                    workspace.selectedEntry ??
                    workspace.entries.find((candidate) => !candidate.isDirectory);
                  if (!entry) return;
                  workspace.addResourceNode(entry, { x: 200, y: 200 });
                }}
                type="button"
              >
                Add resource node
              </button>
            </div>

            <div className="canvas-toolbar__group">
              <button
                aria-pressed={annotationMode}
                onClick={() => setAnnotationMode((value) => !value)}
                type="button"
              >
                Draw annotation
              </button>
              <button onClick={createSequence} type="button">
                Create sequence
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
            selectedNodeId={workspace.selectedNodeId}
            onMoveNode={(nodeId, position) => {
              workspace.store.getState().updateNodePosition(nodeId, position);
            }}
            onSelectNode={(nodeId) => {
              workspace.selectNode(nodeId);
              onNodeSelect?.(nodeId);
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
            onDeleteEdge={(edgeId) => {
              workspace.store.getState().deleteEdge(edgeId);
            }}
            onCreateResourceFromFile={(entry, position) => {
              workspace.addResourceNode(entry, position);
            }}
            fileEntries={fileEntries}
          />
          <AnnotationLayer
            annotations={workspace.annotations}
            drawingEnabled={annotationMode}
            onCreateStroke={createAnnotation}
          />
        </div>

        <footer className="canvas-footer">
          <span>{workspace.nodes.length} nodes</span>
          <span>{workspace.edges.length} connections</span>
          <span data-testid="annotation-count">
            {workspace.annotations.length} annotations
          </span>
          <span>{workspace.sequences.length} sequences</span>
        </footer>
      </div>
    </div>
  );
}
