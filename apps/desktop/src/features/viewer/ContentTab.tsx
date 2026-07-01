import { useEffect, useState } from "react";
import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";
import { createWorkspaceTransport, readWorkspaceTextFile } from "@research-canvas/desktop-api";
import type { GraphNode, GraphNodePatch } from "@research-canvas/desktop-api";
import { NodeContentPane } from "./NodeContentPane";
import { NodeDocumentPane } from "./NodeDocumentPane";

interface ContentTabProps {
  onFullScreen: () => void;
}

export function ContentTab({ onFullScreen }: ContentTabProps) {
  const workspace = useCanvasWorkspace();
  const node = workspace.nodes.find((n) => n.id === workspace.selectedNodeId) ?? null;
  const textResourceNode =
    node?.type === "resource" &&
    node.absolutePath &&
    (node.resourceKind === "markdown" || node.resourceKind === "text")
      ? node
      : null;
  const [textContent, setTextContent] = useState<string | null>(null);

  useEffect(() => {
    setTextContent(null);
    if (!textResourceNode) return;
    readWorkspaceTextFile(textResourceNode.absolutePath)
      .then(setTextContent)
      .catch(() => setTextContent(null));
  }, [textResourceNode]);

  if (!node) {
    return <div className="content-tab-empty">No node selected</div>;
  }

  const graphNodeId =
    (node as unknown as { graphNodeId?: string }).graphNodeId ?? null;

  if (graphNodeId) {
    return (
      <GraphDocumentContent
        graphNodeId={graphNodeId}
        transport={createWorkspaceTransport() as unknown as GraphDocumentTransport}
      />
    );
  }

  return (
    <NodeContentPane
      node={node}
      textContent={textContent}
      onFullScreen={onFullScreen}
      onNoteContentChange={(content) => workspace.updateNodeContent(node.id, content)}
    />
  );
}

interface GraphDocumentTransport {
  readGraphNode(input: { graphNodeId: string }): Promise<GraphNode>;
  updateGraphNode(input: {
    graphNodeId: string;
    patch: GraphNodePatch;
  }): Promise<GraphNode>;
}

export function GraphDocumentContent({
  graphNodeId,
  transport,
  editable = true,
}: {
  graphNodeId: string;
  transport: GraphDocumentTransport;
  editable?: boolean;
}) {
  return (
    <NodeDocumentPane
      graphNodeId={graphNodeId}
      transport={transport}
      editable={editable}
    />
  );
}
