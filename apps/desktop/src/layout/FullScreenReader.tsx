import { useEffect, useMemo, useState } from "react";
import type { CanvasNode } from "@research-canvas/schema";
import { readWorkspaceTextFile } from "@research-canvas/desktop-api";
import { SequencePresenter } from "@research-canvas/canvas";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";
import { NodeContentPane } from "../features/viewer/NodeContentPane";
import { NodeReaderBody } from "../features/viewer/NodeReaderBody";
import { GraphDocumentAuthoringActions } from "../features/viewer/GraphDocumentContent";
import {
  readerRecordFromCanvasNode,
  readerRecordWithGraphNode,
  type ReaderRecord,
} from "../features/viewer/readerRecord";
import { ReaderSurface } from "../features/viewer/ReaderSurface";

interface FullScreenReaderProps {
  mode: "node" | "sequence";
  onClose: () => void;
  record?: ReaderRecord | null;
}

export function FullScreenReader({ mode, onClose, record = null }: FullScreenReaderProps) {
  if (mode === "sequence") {
    return <SequenceMode onClose={onClose} />;
  }
  return <NodeMode onClose={onClose} record={record} />;
}

function NodeMode({ onClose, record }: { onClose: () => void; record: ReaderRecord | null }) {
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

  useEffect(() => {
    if (!activeRecord) onClose();
  }, [activeRecord, onClose]);

  if (!activeRecord) return null;

  return (
    <div className="fullscreen-reader">
      <ReaderSurface
        record={activeRecord}
        workspaceRoot={workspace.workingRoot}
        variant="full"
        onExit={onClose}
        actions={activeRecord.graphNodeId ? (
          <GraphDocumentAuthoringActions
            graphNodeId={activeRecord.graphNodeId}
            onGraphNodeUpdated={(graphNode) => setActiveRecord((current) => current ? readerRecordWithGraphNode(current, graphNode) : current)}
          />
        ) : undefined}
      >
        <NodeReaderBody node={activeRecord.canvasNode} record={activeRecord} affordances={false} />
      </ReaderSurface>
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
