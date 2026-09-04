import {
  Handle,
  NodeResizeControl,
  type Node,
  type NodeProps,
} from "@xyflow/react";

import {
  HANDLE_POSITIONS,
  HANDLE_SIDES,
  sourceHandleId,
  targetHandleId,
} from "./nodeHandles";

interface ImageNodeData {
  src: string;
  caption?: string;
  title?: string;
  onCaptionChange?: (caption: string) => void;
  [key: string]: unknown;
}

export type ImageNodeType = Node<ImageNodeData, "image">;

export function ImageNode({ id, data, selected }: NodeProps<ImageNodeType>) {
  return (
    <>
      <NodeResizeControl
        minWidth={80}
        minHeight={80}
        position="bottom-right"
        className="node-resize-control node-resize-control--bottom-right"
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
          className="image-node"
          data-testid={`image-node-${id}`}
          data-selected={selected ? "true" : "false"}
        >
          <img
            alt={data.caption ?? data.title ?? "Canvas image"}
            className="image-node__image"
            draggable={false}
            src={data.src}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
          {selected ? (
            <input
              aria-label="Image caption"
              className="image-node__caption nodrag nopan"
              data-testid="image-node-caption"
              onChange={(event) => data.onCaptionChange?.(event.target.value)}
              onPointerDown={(event) => event.stopPropagation()}
              placeholder="Caption"
              type="text"
              value={data.caption ?? ""}
            />
          ) : data.caption ? (
            <span className="image-node__caption-static">{data.caption}</span>
          ) : null}
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
