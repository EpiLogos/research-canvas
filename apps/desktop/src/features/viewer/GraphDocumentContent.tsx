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
    <NodeContentDropSurface graphNodeId={graphNodeId}>
      <NodeDocumentPane
        graphNodeId={graphNodeId}
        transport={transport}
        editable={editable}
      />
      <div className="graph-document-content__linking">
        <LinkFilePicker graphNodeId={graphNodeId} />
        <LinkNodePicker sourceGraphNodeId={graphNodeId} />
      </div>
    </NodeContentDropSurface>
  );
}
