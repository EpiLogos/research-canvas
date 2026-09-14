import { useCallback, useEffect, useState } from "react";
import type {
  GraphNode,
  LocalNodeDocument,
  TimelineRelationField as TimelineRelationFieldData,
} from "@research-canvas/desktop-api";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";
import { NodeContentDropSurface } from "../features/canvas/NodeContentDropSurface";
import { NodeReaderBody } from "../features/viewer/NodeReaderBody";
import { GraphDocumentAuthoringActions } from "../features/viewer/GraphDocumentContent";
import {
  readerRecordWithCanonicalCover,
  readerRecordWithGraphNode,
  type ReaderRecord,
} from "../features/viewer/readerRecord";
import { ReaderSurface } from "../features/viewer/ReaderSurface";

interface ReaderPaneProps {
  record: ReaderRecord;
  relationField?: TimelineRelationFieldData | null;
  onFullScreen: (record: ReaderRecord, relationField?: TimelineRelationFieldData | null) => void;
  onExit: () => void;
}

/**
 * An inline reader rendered inside the stage (replacing the old floating
 * ReadingLens overlay). It reuses the same ReaderSurface + NodeReaderBody
 * substance as the full-screen reader, and offers a full-screen shortcut.
 */
export function ReaderPane({ record, relationField = null, onFullScreen, onExit }: ReaderPaneProps) {
  const workspace = useCanvasWorkspace();
  const [openRecord, setOpenRecord] = useState<ReaderRecord>(record);

  useEffect(() => {
    setOpenRecord(record);
  }, [record.graphNodeId, record.canvasNode?.id, record.graphNode?.contentRevision, record.coverReference]);

  const activeGraphNodeId = openRecord.graphNodeId;

  useEffect(() => {
    const readLocalDocument = workspace.transport?.readLocalNodeDocument;
    if (!activeGraphNodeId || !workspace.databasePath || typeof readLocalDocument !== "function") return;
    let cancelled = false;
    void readLocalDocument.call(workspace.transport, {
      databasePath: workspace.databasePath,
      graphNodeId: activeGraphNodeId,
    })
      .then((document: LocalNodeDocument | null) => {
        if (!cancelled && document && !document.neo4jSynced) {
          setOpenRecord((current) => current.graphNodeId === activeGraphNodeId
            ? readerRecordWithLocalDocument(current, document)
            : current);
        }
      })
      .catch(() => {
        // Static/browser adapters have no local document projection.
      });
    return () => { cancelled = true; };
  }, [activeGraphNodeId, workspace.databasePath, workspace.transport]);

  useEffect(() => {
    const readPresentation = workspace.transport?.readNodeAttachmentPresentation;
    if (!activeGraphNodeId || typeof readPresentation !== "function") return;
    let cancelled = false;
    void readPresentation.call(workspace.transport, {
      databasePath: workspace.databasePath ?? undefined,
      graphNodeId: activeGraphNodeId,
    })
      .then((presentation: { cover?: { managedPath: string | null } | null }) => {
        if (!cancelled) {
          setOpenRecord((current) => current.graphNodeId === activeGraphNodeId
            ? readerRecordWithCanonicalCover(current, presentation.cover?.managedPath ?? null)
            : current);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeGraphNodeId, workspace.databasePath, workspace.transport]);

  const updateOpenRecord = useCallback((graphNode: GraphNode) => {
    setOpenRecord((current) => readerRecordWithGraphNode(current, graphNode));
  }, []);

  const readerSurface = (
    <ReaderSurface
      record={openRecord}
      workspaceRoot={workspace.workingRoot}
      variant="lens"
      onExit={onExit}
      onFullScreen={() => onFullScreen(openRecord, relationField)}
      actions={openRecord.graphNodeId ? (
        <GraphDocumentAuthoringActions
          graphNodeId={openRecord.graphNodeId}
          openGraphNode={openRecord.graphNode}
          nativeDropTarget={false}
          onGraphNodeUpdated={updateOpenRecord}
        />
      ) : undefined}
      relationField={relationField}
    >
      <NodeReaderBody node={openRecord.canvasNode} record={openRecord} affordances={false} />
    </ReaderSurface>
  );

  return (
    <section className="shell-reader-pane" data-testid="reader-pane">
      {openRecord.graphNodeId ? (
        <NodeContentDropSurface
          graphNodeId={openRecord.graphNodeId}
          openGraphNode={openRecord.graphNode}
          className="reader-native-drop-surface"
          onGraphNodeUpdated={updateOpenRecord}
        >
          {readerSurface}
        </NodeContentDropSurface>
      ) : readerSurface}
    </section>
  );
}

function readerRecordWithLocalDocument(
  record: ReaderRecord,
  document: LocalNodeDocument,
): ReaderRecord {
  if (!record.graphNode || record.graphNode.graphNodeId !== document.graphNodeId) return record;
  return readerRecordWithGraphNode(record, {
    ...record.graphNode,
    body: document.body,
    summary: document.summary,
    contentRevision: document.contentRevision ?? record.graphNode.contentRevision,
    bodySourceCoordinates: document.bodySourceCoordinates ?? record.graphNode.bodySourceCoordinates,
  });
}
