import { useState } from "react";

import { AnnotationLayer, CanvasView } from "@research-canvas/canvas";

import { useCanvasWorkspace } from "./CanvasWorkspaceContext";

export function CanvasScreen() {
  const workspace = useCanvasWorkspace();
  const [annotationMode, setAnnotationMode] = useState(false);

  if (!workspace.isHydrated) {
    return (
      <div className="canvas-workspace">
        <p>Loading canvas workspace.</p>
      </div>
    );
  }

  const addNoteNode = () => {
    const node = workspace.store.getState().createNoteNode({
      title: "Opening note",
      content: "# Opening note\n\nThe thesis starts here.\n\n- first supporting point\n- second supporting point"
    });
    workspace.selectNode(node.id);
  };

  const addResourceNode = () => {
    const entry =
      workspace.selectedEntry ??
      workspace.entries.find((candidate) => !candidate.isDirectory);
    if (!entry) {
      return;
    }

    const node = workspace.store.getState().createResourceNode({
      title: "Source report",
      absolutePath: entry.absolutePath,
      relativePath: entry.relativePath,
      resourceKind: resourceKindForEntry(entry.kind)
    });
    workspace.selectNode(node.id);
  };

  const linkLatestNodes = () => {
    const latestNodes = workspace.nodes.slice(-2);
    if (latestNodes.length < 2) {
      return;
    }

    const edge = workspace.store.getState().connectNodes({
      sourceNodeId: latestNodes[0].id,
      targetNodeId: latestNodes[1].id,
      relationKind: "supports"
    });
    workspace.store.getState().updateEdgeNote(edge.id, "Primary supporting source");
  };

  const createSequence = () => {
    const existing = workspace.sequences[0];
    if (existing) {
      workspace.sequenceStore.getState().setActiveSequence(existing.id);
      return;
    }

    workspace.sequenceStore.getState().createSequence({
      kind: "storyboard",
      name: "Episode flow"
    });
  };

  const addLatestNodesToSequence = () => {
    const sequence =
      workspace.sequences[0] ??
      workspace.sequenceStore.getState().createSequence({
        kind: "storyboard",
        name: "Episode flow"
      });
    const existingSteps = workspace.sequenceStore.getState().stepsForSequence(sequence.id);
    if (existingSteps.length > 0) {
      return;
    }

    const latestNodes = workspace.nodes.slice(-2);
    if (latestNodes.length < 2) {
      return;
    }

    workspace.sequenceStore.getState().setActiveSequence(sequence.id);
    workspace.sequenceStore.getState().addNodeStep(sequence.id, {
      caption: "Start with the thesis",
      targetId: latestNodes[0].id,
      viewport: { x: 0, y: 0, zoom: 1 }
    });
    workspace.sequenceStore.getState().addNodeStep(sequence.id, {
      caption: "Support it with the report",
      targetId: latestNodes[1].id,
      viewport: { x: 160, y: 40, zoom: 1.2 }
    });
  };

  const createAnnotation = (points: Parameters<
    ReturnType<typeof workspace.annotationStore.getState>["createStrokeAnnotation"]
  >[0]["points"]) => {
    workspace.annotationStore.getState().createStrokeAnnotation({
      points,
      strokeKind: "stroke"
    });
    setAnnotationMode(false);
  };

  return (
    <div className="canvas-workspace">
      <div className="canvas-stage">
        <div className="canvas-chrome">
          <header className="canvas-toolbar">
            <div className="canvas-toolbar__group">
              <button onClick={addNoteNode} type="button">
                Add note node
              </button>
              <button onClick={addResourceNode} type="button">
                Add resource node
              </button>
              <button onClick={linkLatestNodes} type="button">
                Link latest nodes
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
              <button onClick={addLatestNodesToSequence} type="button">
                Add latest nodes to sequence
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
            }}
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

function resourceKindForEntry(kind: string) {
  switch (kind) {
    case "directory":
    case "markdown":
    case "image":
    case "pdf":
    case "text":
    case "binary":
      return kind;
    default:
      return "binary";
  }
}
