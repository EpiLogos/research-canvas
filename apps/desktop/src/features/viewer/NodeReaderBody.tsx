import { useEffect, useState } from "react";
import type { CanvasNode } from "@research-canvas/schema";
import { createWorkspaceTransport, readWorkspaceTextFile } from "@research-canvas/desktop-api";
import type {
  GraphNode,
  LocalNodeDocumentInput,
  LocalNodeDocumentWriteResult,
} from "@research-canvas/desktop-api";
import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";
import { NodeContentPane } from "./NodeContentPane";
import { GraphDocumentContent } from "./GraphDocumentContent";
import { NodeDocumentPane } from "./NodeDocumentPane";

export function NodeReaderBody({
  node,
  affordances = true,
}: {
  node: CanvasNode;
  affordances?: boolean;
}) {
  const workspace = useCanvasWorkspace();
  const textResourceNode =
    node.type === "resource" &&
    node.absolutePath &&
    (node.resourceKind === "markdown" || node.resourceKind === "text")
      ? node
      : null;
  const [textContent, setTextContent] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTextContent(null);
    if (!textResourceNode) {
      return () => {
        cancelled = true;
      };
    }
    readWorkspaceTextFile(textResourceNode.absolutePath)
      .then((content) => {
        if (!cancelled) {
          setTextContent(content);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTextContent(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [textResourceNode]);

  if (node.type === "resource") {
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

  const graphNodeId = (node as unknown as { graphNodeId?: string }).graphNodeId ?? null;
  if (graphNodeId) {
    const transport = createWorkspaceTransport() as unknown as {
      readGraphNode: (input: { graphNodeId: string }) => Promise<GraphNode>;
      readLocalNodeDocument: (input: {
        databasePath: string;
        graphNodeId: string;
      }) => Promise<{ body: string; summary: string; neo4jSynced: boolean; contentRevision?: number; bodySourceCoordinates?: string[] } | null>;
      upsertLocalNodeDocument: (input: LocalNodeDocumentInput) => Promise<LocalNodeDocumentWriteResult>;
    };
    const databasePath = workspace.databasePath ?? null;
    return affordances ? (
      <GraphDocumentContent
        graphNodeId={graphNodeId}
        transport={transport}
        databasePath={databasePath}
      />
    ) : (
      <NodeDocumentPane
        graphNodeId={graphNodeId}
        transport={transport}
        databasePath={databasePath}
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
