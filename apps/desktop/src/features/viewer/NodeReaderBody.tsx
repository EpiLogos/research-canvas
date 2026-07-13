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
import type { ReaderRecord } from "./readerRecord";

export function NodeReaderBody({
  node,
  record = null,
  affordances = true,
}: {
  node?: CanvasNode | null;
  record?: ReaderRecord | null;
  affordances?: boolean;
}) {
  const workspace = useCanvasWorkspace();
  const canvasNode = node ?? record?.canvasNode ?? null;
  const textResourceNode =
    canvasNode?.type === "resource" &&
    canvasNode.absolutePath &&
    (canvasNode.resourceKind === "markdown" || canvasNode.resourceKind === "text")
      ? canvasNode
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

  if (canvasNode?.type === "resource") {
    return (
      <NodeContentPane
        node={canvasNode}
        textContent={textContent}
        onFullScreen={() => {}}
        onNoteContentChange={(content) => workspace.updateNodeContent(canvasNode.id, content)}
        showToolbar={false}
      />
    );
  }

  const graphNodeId = record?.graphNodeId ?? canvasNode?.graphNodeId ?? null;
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
        showAuthoringControls={false}
      />
    ) : (
      <NodeDocumentPane
        graphNodeId={graphNodeId}
        transport={transport}
        databasePath={databasePath}
        workspaceRoot={workspace.workingRoot}
      />
    );
  }

  return canvasNode ? (
    <NodeContentPane
      node={canvasNode}
      textContent={textContent}
      onFullScreen={() => {}}
      onNoteContentChange={(content) => workspace.updateNodeContent(canvasNode.id, content)}
      showToolbar={false}
    />
  ) : <div className="content-tab__placeholder">No content</div>;
}
