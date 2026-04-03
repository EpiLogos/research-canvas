import {
  Handle,
  NodeResizeControl,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useEffect, useRef } from "react";

import type { AdaptiveNodeStyle } from "./AdaptiveNode";
import {
  HANDLE_POSITIONS,
  HANDLE_SIDES,
  sourceHandleId,
  targetHandleId,
} from "./nodeHandles";

interface NoteNodeData {
  title: string;
  summary?: string;
  style?: AdaptiveNodeStyle;
  content?: string;
  isEditing?: boolean;
  onContentChange?: (content: string) => void;
  onStartEditing?: () => void;
  onStopEditing?: () => void;
  [key: string]: unknown;
}

export type NoteNodeType = Node<NoteNodeData, "note">;

export function NoteNode({ data, selected }: NodeProps<NoteNodeType>) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (data.isEditing) {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(
        textareaRef.current.value.length,
        textareaRef.current.value.length,
      );
    }
  }, [data.isEditing]);

  return (
    <>
      <NodeResizeControl
        minWidth={120}
        minHeight={60}
        position="bottom-right"
        className="node-resize-control"
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
          data-editing={data.isEditing ? "true" : "false"}
          data-selected={selected ? "true" : "false"}
          onDoubleClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            data.onStartEditing?.();
          }}
        >
          {data.isEditing ? (
            <textarea
              aria-label="Edit note"
              className="note-node__editor nodrag nopan"
              onBlur={() => data.onStopEditing?.()}
              onChange={(event) => data.onContentChange?.(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  data.onStopEditing?.();
                }
              }}
              onPointerDown={(event) => event.stopPropagation()}
              ref={textareaRef}
              value={data.content ?? ""}
            />
          ) : (
            <div className="note-node__preview">
              {data.content ?? ""}
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
