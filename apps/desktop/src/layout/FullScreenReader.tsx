import { useEffect, useMemo, useState } from "react";
import type { CanvasNode } from "@research-canvas/schema";
import { readWorkspaceTextFile } from "@research-canvas/desktop-api";
import { SequencePresenter } from "@research-canvas/canvas";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";
import { NodeContentPane } from "../features/viewer/NodeContentPane";
import { NodeReaderBody } from "../features/viewer/NodeReaderBody";

interface FullScreenReaderProps {
  mode: "node" | "sequence";
  onClose: () => void;
}

export function FullScreenReader({ mode, onClose }: FullScreenReaderProps) {
  if (mode === "sequence") {
    return <SequenceMode onClose={onClose} />;
  }
  return <NodeMode onClose={onClose} />;
}

function NodeMode({ onClose }: { onClose: () => void }) {
  const workspace = useCanvasWorkspace();
  const node: CanvasNode | null =
    workspace.nodes.find((n) => n.id === workspace.selectedNodeId) ?? null;

  useEffect(() => {
    if (!node) onClose();
  }, [node, onClose]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (!node) return null;

  return (
    <div className="fullscreen-reader">
      <header className="fullscreen-reader__header">
        <nav className="fullscreen-reader__breadcrumb">
          <span>{workspace.activeProject?.displayName ?? "Project"}</span>
          <span className="fsr-sep">&rsaquo;</span>
          <span>Canvas</span>
          <span className="fsr-sep">&rsaquo;</span>
          <span className="fsr-current">{node.title}</span>
        </nav>
        <button className="fullscreen-reader__close" onClick={onClose} title="Back to canvas (Esc)">&larr; Back</button>
      </header>
      <main className="fullscreen-reader__body">
        <NodeReaderBody node={node} />
      </main>
    </div>
  );
}

function SequenceMode({ onClose }: { onClose: () => void }) {
  const workspace = useCanvasWorkspace();

  const renderNodeContent = useMemo(
    () => (node: CanvasNode) => <SequenceNodeContent node={node} />,
    []
  );

  return (
    <SequencePresenter
      nodes={workspace.nodes}
      edges={workspace.edges}
      onClose={onClose}
      renderNodeContent={renderNodeContent}
      onNavigateToNode={(nodeId, viewport) => {
        workspace.flyToNode(nodeId, viewport ?? undefined);
      }}
      projectName={workspace.activeProject?.displayName}
    />
  );
}

function SequenceNodeContent({ node }: { node: CanvasNode }) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const textResourceNode =
    node.type === "resource" &&
    node.absolutePath &&
    (node.resourceKind === "markdown" || node.resourceKind === "text")
      ? node
      : null;

  useEffect(() => {
    setTextContent(null);
    if (!textResourceNode) return;
    readWorkspaceTextFile(textResourceNode.absolutePath)
      .then(setTextContent)
      .catch(() => setTextContent(null));
  }, [textResourceNode]);

  return (
    <NodeContentPane
      node={node}
      textContent={textContent}
      onFullScreen={() => {}}
      showToolbar={false}
    />
  );
}
