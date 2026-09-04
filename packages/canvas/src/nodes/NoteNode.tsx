import {
  Handle,
  NodeResizeControl,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useEffect, useRef } from "react";

import type { NodeVisualStyle } from "./nodeVisualStyle";
import { KnowledgeCard } from "./KnowledgeCard";
import { resolveKnowledgeCardPresentation } from "../presentation/cardPresentation";
import type { GraphNodeContract } from "@research-canvas/schema";
import { BlockNoteDocument } from "@research-canvas/viewers";
import {
  HANDLE_POSITIONS,
  HANDLE_SIDES,
  sourceHandleId,
  targetHandleId,
} from "./nodeHandles";

interface NoteNodeData {
  title: string;
  summary?: string;
  graph?: GraphNodeContract;
  style?: NodeVisualStyle;
  tags?: string[];
  content?: string;
  isEditing?: boolean;
  onContentChange?: (content: string) => void;
  onStartEditing?: () => void;
  onStopEditing?: () => void;
  [key: string]: unknown;
}

export type NoteNodeType = Node<NoteNodeData, "note">;

export function NoteNode({ id, data, selected }: NodeProps<NoteNodeType>) {
  const editorRef = useRef<HTMLDivElement>(null);
  const presentation = resolveKnowledgeCardPresentation({
    title: data.title,
    summary: data.summary ?? "",
    dotColour: data.style?.dotColour,
    bgColour: data.style?.bgColour,
    textColour: data.style?.textColour,
    thumbnail: data.style?.thumbnail,
  }, data.graph);

  useEffect(() => {
    if (data.isEditing) {
      // Focus the editor wrapper so keyboard shortcuts are captured without
      // stealing ReactFlow drag/select behaviour.
      editorRef.current?.focus({ preventScroll: true });
    }
  }, [data.isEditing]);

  return (
    <>
      <NodeResizeControl
        minWidth={120}
        minHeight={60}
        position="bottom-right"
        className="node-resize-control node-resize-control--bottom-right"
        style={{ display: selected ? "flex" : "none" }}
      >
        <div className="node-resize-grip" />
      </NodeResizeControl>
      <NodeResizeControl
        minWidth={120}
        minHeight={60}
        position="bottom-left"
        className="node-resize-control node-resize-control--bottom-left"
        style={{ display: selected ? "flex" : "none" }}
      >
        <div className="node-resize-grip" />
      </NodeResizeControl>
      <NodeResizeControl
        minWidth={120}
        minHeight={60}
        position="top-right"
        className="node-resize-control node-resize-control--top-right"
        style={{ display: selected ? "flex" : "none" }}
      >
        <div className="node-resize-grip" />
      </NodeResizeControl>
      <NodeResizeControl
        minWidth={120}
        minHeight={60}
        position="top-left"
        className="node-resize-control node-resize-control--top-left"
        style={{ display: selected ? "flex" : "none" }}
      >
        <div className="node-resize-grip" />
      </NodeResizeControl>
      <div style={{ width: "100%", height: "100%", position: "relative" }}>
        {HANDLE_SIDES.map((side) => (
          <Handle
            id={targetHandleId(side)}
            key={`target-${side}`}
            type="target"
            position={HANDLE_POSITIONS[side]}
            className="flow-handle"
          />
        ))}
        <div
          className="note-node"
          data-testid={`note-node-${id}`}
          data-editing={data.isEditing ? "true" : "false"}
          data-selected={selected ? "true" : "false"}
        >
          {data.isEditing ? (
            <div
              ref={editorRef}
              className="note-node__editor nodrag nopan"
              tabIndex={0}
              onPointerDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  data.onStopEditing?.();
                }
              }}
            >
              <BlockNoteDocument
                body={data.content ?? "[]"}
                editable
                onChange={(content) => data.onContentChange?.(content)}
              />
            </div>
          ) : (
            <div
              className="note-node__preview"
              onDoubleClick={(event) => {
                event.stopPropagation();
                data.onStartEditing?.();
              }}
            >
              {data.content && data.content !== "[]" ? (
                <BlockNoteDocument body={data.content} editable={false} />
              ) : (
                <KnowledgeCard presentation={presentation} />
              )}
            </div>
          )}
        </div>
        {HANDLE_SIDES.map((side) => (
          <Handle
            id={sourceHandleId(side)}
            key={`source-${side}`}
            type="source"
            position={HANDLE_POSITIONS[side]}
            className="flow-handle"
          />
        ))}
      </div>
    </>
  );
}
