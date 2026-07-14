import { useState } from "react";

import type {
  GraphNode,
  LocalNodeDocumentInput,
  LocalNodeDocumentWriteResult,
} from "@research-canvas/desktop-api";
import { NodeDocumentPane } from "./NodeDocumentPane";
import { NodeContentDropSurface } from "../canvas/NodeContentDropSurface";
import { LinkFilePicker } from "../canvas/LinkFilePicker";
import { LinkNodePicker } from "../canvas/LinkNodePicker";
import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";
import { pickAndInsertImage, pickAndAttachFile, type MediaPickerActions } from "../canvas/insertMedia";
import { attachNodeMedia } from "./nodeAttachmentActions";

interface GraphDocumentTransport {
  readGraphNode(input: { graphNodeId: string }): Promise<GraphNode>;
  readLocalNodeDocument(input: {
    databasePath: string;
    graphNodeId: string;
  }): Promise<{ body: string; summary: string; neo4jSynced: boolean; contentRevision?: number; bodySourceCoordinates?: string[] } | null>;
  upsertLocalNodeDocument(input: LocalNodeDocumentInput): Promise<LocalNodeDocumentWriteResult>;
}

export function GraphDocumentContent({
  graphNodeId,
  transport,
  databasePath,
  editable = true,
  showAuthoringControls = true,
}: {
  graphNodeId: string;
  transport: GraphDocumentTransport;
  databasePath: string | null;
  editable?: boolean;
  /** Render insertion/link controls in the surrounding UI, never in prose by default. */
  showAuthoringControls?: boolean;
}) {
  const workspace = useCanvasWorkspace();
  return (
    <NodeContentDropSurface graphNodeId={graphNodeId}>
      <NodeDocumentPane
        graphNodeId={graphNodeId}
        transport={transport}
        databasePath={databasePath}
        workspaceRoot={workspace.workingRoot}
        editable={editable}
      />
      {showAuthoringControls ? (
        <GraphDocumentAuthoringActions graphNodeId={graphNodeId} nativeDropTarget={false} />
      ) : null}
    </NodeContentDropSurface>
  );
}

/**
 * Actual document mutation controls, rendered by ReaderSurface inside its
 * details/action drawer. Keeping this separate from the document prevents the
 * controls from being mistaken for part of a node's authored long-form text.
 */
export function GraphDocumentAuthoringActions({
  graphNodeId,
  openGraphNode,
  onGraphNodeUpdated,
  nativeDropTarget = true,
}: {
  graphNodeId: string;
  openGraphNode?: GraphNode | null;
  onGraphNodeUpdated?: (graphNode: GraphNode) => void;
  /** The document editor already owns a drop target; live readers need one. */
  nativeDropTarget?: boolean;
}) {
  const controls = (
    <div className="graph-document-content__linking" role="group" aria-label="Node authoring actions">
      <InsertMediaButtons
        graphNodeId={graphNodeId}
        openGraphNode={openGraphNode}
        onGraphNodeUpdated={onGraphNodeUpdated}
      />
      <LinkFilePicker graphNodeId={graphNodeId} />
      <LinkNodePicker sourceGraphNodeId={graphNodeId} />
    </div>
  );
  return nativeDropTarget ? (
    <NodeContentDropSurface
      graphNodeId={graphNodeId}
      openGraphNode={openGraphNode}
      onGraphNodeUpdated={onGraphNodeUpdated}
    >
      {controls}
    </NodeContentDropSurface>
  ) : controls;
}

function InsertMediaButtons({
  graphNodeId,
  openGraphNode,
  onGraphNodeUpdated,
}: {
  graphNodeId: string;
  openGraphNode?: GraphNode | null;
  onGraphNodeUpdated?: (graphNode: GraphNode) => void;
}) {
  const workspace = useCanvasWorkspace();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const runPicker = async (
    picker: (graphNodeId: string, actions: MediaPickerActions) => Promise<{ ok: boolean; message?: string }>,
  ) => {
    setErrorMessage(null);
    const actions: MediaPickerActions = {
      addImageToNode: async (nodeId, sourceAbsolutePath, caption) => {
        const attached = await attachNodeMedia({
          transport: workspace.transport,
          databasePath: workspace.databasePath,
          workspaceRoot: workspace.workingRoot,
          graphNodeId: nodeId,
          sourceAbsolutePath,
          kind: "image",
          role: "inline",
          caption,
          openGraphNode,
        });
        onGraphNodeUpdated?.(attached.graphNode);
        return attached.graphNode;
      },
      attachFileToNode: async (nodeId, sourceAbsolutePath, fileName) => {
        const attached = await attachNodeMedia({
          transport: workspace.transport,
          databasePath: workspace.databasePath,
          workspaceRoot: workspace.workingRoot,
          graphNodeId: nodeId,
          sourceAbsolutePath,
          kind: "file",
          role: "file",
          caption: fileName,
          openGraphNode,
        });
        onGraphNodeUpdated?.(attached.graphNode);
        return attached.graphNode;
      },
    };
    const result = await picker(graphNodeId, actions);
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
