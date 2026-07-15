import { useCallback, useEffect, useMemo, useState } from "react";
import type { CanvasNode } from "@research-canvas/schema";
import { readWorkspaceTextFile, type GraphNode, type TimelineRelationField as TimelineRelationFieldData } from "@research-canvas/desktop-api";
import { SequencePresenter } from "@research-canvas/canvas";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";
import { NodeContentDropSurface } from "../features/canvas/NodeContentDropSurface";
import { NodeContentPane } from "../features/viewer/NodeContentPane";
import { NodeReaderBody } from "../features/viewer/NodeReaderBody";
import { GraphDocumentAuthoringActions } from "../features/viewer/GraphDocumentContent";
import {
  readerRecordFromCanvasNode,
  readerRecordWithCanonicalCover,
  readerRecordWithGraphNode,
  readerRecordWithLocalDocument,
  type ReaderRecord,
} from "../features/viewer/readerRecord";
import { ReaderSurface } from "../features/viewer/ReaderSurface";

interface FullScreenReaderProps {
  mode: "node" | "sequence";
  onClose: () => void;
  record?: ReaderRecord | null;
  relationField?: TimelineRelationFieldData | null;
  onOpenRelatedNode?: (graphNodeId: string, node: GraphNode) => void;
}

export function FullScreenReader({ mode, onClose, record = null, relationField = null, onOpenRelatedNode }: FullScreenReaderProps) {
  if (mode === "sequence") {
    return <SequenceMode onClose={onClose} />;
  }
  return <NodeMode onClose={onClose} record={record} relationField={relationField} onOpenRelatedNode={onOpenRelatedNode} />;
}

function NodeMode({
  onClose,
  record,
  relationField,
  onOpenRelatedNode,
}: {
  onClose: () => void;
  record: ReaderRecord | null;
  relationField: TimelineRelationFieldData | null;
  onOpenRelatedNode?: (graphNodeId: string, node: GraphNode) => void;
}) {
  const workspace = useCanvasWorkspace();
  const node: CanvasNode | null =
    workspace.nodes.find((n) => n.id === workspace.selectedNodeId) ?? null;
  const incomingRecord = record ?? (node ? readerRecordFromCanvasNode(node) : null);
  const incomingRecordKey = incomingRecord
    ? `${incomingRecord.graphNodeId ?? incomingRecord.canvasNode?.id ?? "none"}:${incomingRecord.graphNode?.contentRevision ?? "local"}:${incomingRecord.graphNode?.body ?? incomingRecord.coverReference ?? ""}`
    : "none";
  const [activeRecord, setActiveRecord] = useState<ReaderRecord | null>(incomingRecord);

  useEffect(() => {
    setActiveRecord(incomingRecord);
  }, [incomingRecordKey]);

  const activeGraphNodeId = activeRecord?.graphNodeId ?? null;
  useEffect(() => {
    const readLocalDocument = workspace.transport?.readLocalNodeDocument;
    if (!activeGraphNodeId || !workspace.databasePath || typeof readLocalDocument !== "function") return;
    let cancelled = false;
    void readLocalDocument.call(workspace.transport, {
      databasePath: workspace.databasePath,
      graphNodeId: activeGraphNodeId,
    })
      .then((document) => {
        if (!cancelled && document && !document.neo4jSynced) {
          setActiveRecord((current) => current?.graphNodeId === activeGraphNodeId
            ? readerRecordWithLocalDocument(current, document)
            : current);
        }
      })
      .catch(() => {
        // Static/browser readers retain the open record's graph fallback.
      });
    return () => {
      cancelled = true;
    };
  }, [activeGraphNodeId, workspace.databasePath, workspace.transport]);

  useEffect(() => {
    const readPresentation = workspace.transport?.readNodeAttachmentPresentation;
    // Browser/static compatibility adapters have no local attachment store;
    // desktop always supplies this method through WorkspaceTransport.
    if (!activeGraphNodeId || typeof readPresentation !== "function") return;
    let cancelled = false;
    void readPresentation.call(workspace.transport, {
        databasePath: workspace.databasePath ?? undefined,
        graphNodeId: activeGraphNodeId,
      })
      .then((presentation) => {
        if (!cancelled) {
          setActiveRecord((current) => current?.graphNodeId === activeGraphNodeId
            ? readerRecordWithCanonicalCover(current, presentation.cover?.managedPath ?? null)
            : current);
        }
      })
      .catch(() => {
        // Static/browser readers retain their layout or inline fallback.
      });
    return () => {
      cancelled = true;
    };
  }, [activeGraphNodeId, workspace.databasePath, workspace.transport]);

  useEffect(() => {
    if (!activeRecord) onClose();
  }, [activeRecord, onClose]);

  const updateOpenRecord = useCallback((graphNode: GraphNode) => {
    setActiveRecord((current) => current ? readerRecordWithGraphNode(current, graphNode) : current);
  }, []);

  if (!activeRecord) return null;

  const readerSurface = (
    <ReaderSurface
      record={activeRecord}
      workspaceRoot={workspace.workingRoot}
      variant="full"
      onExit={onClose}
      actions={activeRecord.graphNodeId ? (
        <GraphDocumentAuthoringActions
          graphNodeId={activeRecord.graphNodeId}
          openGraphNode={activeRecord.graphNode}
          nativeDropTarget={false}
          onGraphNodeUpdated={updateOpenRecord}
        />
      ) : undefined}
      relationField={relationField}
      onOpenRelatedNode={onOpenRelatedNode}
    >
      <NodeReaderBody node={activeRecord.canvasNode} record={activeRecord} affordances={false} />
    </ReaderSurface>
  );

  return (
    <div className="fullscreen-reader">
      {activeRecord.graphNodeId ? (
        <NodeContentDropSurface
          graphNodeId={activeRecord.graphNodeId}
          openGraphNode={activeRecord.graphNode}
          className="reader-native-drop-surface"
          onGraphNodeUpdated={updateOpenRecord}
        >
          {readerSurface}
        </NodeContentDropSurface>
      ) : readerSurface}
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
      constellationName={workspace.activeConstellation?.displayName}
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
