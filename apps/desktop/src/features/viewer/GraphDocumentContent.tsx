import type { GraphNode, GraphNodePatch } from "@research-canvas/desktop-api";
import { NodeDocumentPane } from "./NodeDocumentPane";
import { NodeContentDropSurface } from "../canvas/NodeContentDropSurface";
import { LinkFilePicker } from "../canvas/LinkFilePicker";
import { LinkNodePicker } from "../canvas/LinkNodePicker";

interface GraphDocumentTransport {
  readGraphNode(input: { graphNodeId: string }): Promise<GraphNode>;
  updateGraphNode(input: {
    graphNodeId: string;
    patch: GraphNodePatch;
  }): Promise<GraphNode>;
  readLocalNodeDocument(input: {
    databasePath: string;
    graphNodeId: string;
  }): Promise<{ body: string; summary: string; neo4jSynced: boolean } | null>;
  upsertLocalNodeDocument(input: {
    databasePath: string;
    graphNodeId: string;
    body: string;
    summary: string;
    neo4jSynced?: boolean;
  }): Promise<void>;
}

export function GraphDocumentContent({
  graphNodeId,
  transport,
  databasePath,
  editable = true,
}: {
  graphNodeId: string;
  transport: GraphDocumentTransport;
  databasePath: string | null;
  editable?: boolean;
}) {
  return (
    <NodeContentDropSurface graphNodeId={graphNodeId}>
      <NodeDocumentPane
        graphNodeId={graphNodeId}
        transport={transport}
        databasePath={databasePath}
        editable={editable}
      />
      <div className="graph-document-content__linking">
        <LinkFilePicker graphNodeId={graphNodeId} />
        <LinkNodePicker sourceGraphNodeId={graphNodeId} />
      </div>
    </NodeContentDropSurface>
  );
}
