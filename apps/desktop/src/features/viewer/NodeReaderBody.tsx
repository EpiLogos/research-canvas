import { useEffect, useState } from "react";
import type { CanvasNode } from "@research-canvas/schema";
import { createWorkspaceTransport, readWorkspaceTextFile } from "@research-canvas/desktop-api";
import type { GraphNode, GraphNodePatch } from "@research-canvas/desktop-api";
import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";
import { NodeContentPane } from "./NodeContentPane";
import { GraphDocumentContent } from "./GraphDocumentContent";

export function NodeReaderBody({ node }: { node: CanvasNode }) {
  const workspace = useCanvasWorkspace();
  const textResourceNode =
    node.type === "resource" &&
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

  const graphNodeId = (node as unknown as { graphNodeId?: string }).graphNodeId ?? null;
  if (graphNodeId) {
    return (
      <GraphDocumentContent
        graphNodeId={graphNodeId}
        transport={createWorkspaceTransport() as unknown as {
          readGraphNode: (input: { graphNodeId: string }) => Promise<GraphNode>;
          updateGraphNode: (input: { graphNodeId: string; patch: GraphNodePatch }) => Promise<GraphNode>;
        }}
      />
    );
  }

  return (
    <NodeContentPane
      node={node}
      textContent={textContent}
      onFullScreen={() => {}}
      onNoteContentChange={(content) => workspace.updateNodeContent(node.id, content)}
      showToolbar={false}
    />
  );
}
