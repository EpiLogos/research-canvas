import { useState } from "react";

import type { GraphNode, GraphNodePatch } from "@research-canvas/desktop-api";
import { NodeDocumentPane } from "./NodeDocumentPane";
import { NodeContentDropSurface } from "../canvas/NodeContentDropSurface";
import { LinkFilePicker } from "../canvas/LinkFilePicker";
import { LinkNodePicker } from "../canvas/LinkNodePicker";
import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";
import { pickAndInsertImage, pickAndAttachFile } from "../canvas/insertMedia";

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
        <InsertMediaButtons graphNodeId={graphNodeId} />
        <LinkFilePicker graphNodeId={graphNodeId} />
        <LinkNodePicker sourceGraphNodeId={graphNodeId} />
      </div>
    </NodeContentDropSurface>
  );
}

function InsertMediaButtons({ graphNodeId }: { graphNodeId: string }) {
  const workspace = useCanvasWorkspace();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const runPicker = async (
    picker: (graphNodeId: string, actions: typeof workspace.contentLinkingActions) => Promise<{ ok: boolean; message?: string }>,
  ) => {
    setErrorMessage(null);
    const result = await picker(graphNodeId, workspace.contentLinkingActions);
    if (!result.ok) {
      setErrorMessage(result.message ?? "The action failed.");
    }
  };

  return (
    <div className="graph-document-content__insert-media">
      <button type="button" onClick={() => void runPicker(pickAndInsertImage)}>
        Insert image
      </button>
      <button type="button" onClick={() => void runPicker(pickAndAttachFile)}>
        Attach file
      </button>
      {errorMessage ? (
        <p className="graph-document-content__insert-media-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
