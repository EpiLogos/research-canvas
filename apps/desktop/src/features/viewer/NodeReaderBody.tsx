import { useEffect, useState } from "react";
import type { CanvasNode } from "@research-canvas/schema";
import { BlockNoteDocument } from "@research-canvas/viewers";
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
import { resolveBlockNoteAssetUrls } from "../canvas/resourceFileHelpers";
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

  // Timeline reads already carry an authoritative graph snapshot. Do not
  // force that snapshot through the local authoring-document bridge merely to
  // display it: a browser or a newly bootstrapped workspace may not yet have
  // a local row, while the deep body is already available here. This path is
  // deliberately read-only; authoring remains on the local-first document
  // workflow below.
  if (!affordances && record?.graphNode) {
    const displayBody = resolveBlockNoteAssetUrls(record.graphNode.body, workspace.workingRoot);
    return (
      <div className="node-document-pane node-document-pane--reader" data-testid="graph-reader-body">
        <BlockNoteDocument
          key={workspace.workingRoot ?? "unresolved-workspace"}
          body={displayBody}
          editable={false}
        />
      </div>
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
