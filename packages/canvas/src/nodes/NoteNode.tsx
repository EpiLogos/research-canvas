import {
  Handle,
  NodeResizeControl,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import type { CSSProperties } from "react";
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
  tags?: string[];
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
  const noteStyle = {
    backgroundColor: data.style?.bgColour,
    color: data.style?.textColour,
    "--node-accent": data.style?.dotColour,
  } as CSSProperties;

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
          data-testid="note-node-surface"
          data-editing={data.isEditing ? "true" : "false"}
          data-selected={selected ? "true" : "false"}
          style={noteStyle}
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
            <div
              className="note-node__preview"
              style={{ color: data.style?.textColour } as CSSProperties}
            >
              {data.style?.thumbnail ? (
                <img
                  className="note-node__thumbnail"
                  src={data.style.thumbnail}
                  alt={data.title}
                  draggable={false}
                />
              ) : null}
              {data.content ?? ""}
              {data.tags && data.tags.length > 0 ? (
                <div className="note-node__tags" aria-label="Note tags">
                  {data.tags.map((tag) => (
                    <span className="note-node__tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
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
