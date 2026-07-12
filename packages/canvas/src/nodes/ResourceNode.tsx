import {
  Handle,
  NodeResizeControl,
  useViewport,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import type { CSSProperties } from "react";
import type { AdaptiveNodeStyle } from "./AdaptiveNode";
import {
  HANDLE_POSITIONS,
  HANDLE_SIDES,
  sourceHandleId,
  targetHandleId,
} from "./nodeHandles";

interface ResourceNodeData {
  title: string;
  summary?: string;
  style?: AdaptiveNodeStyle;
  absolutePath?: string;
  resourceKind?: string;
  content?: string;
  [key: string]: unknown;
}

export type ResourceNodeType = Node<ResourceNodeData, "resource">;

export function ResourceNode({ data, selected }: NodeProps<ResourceNodeType>) {
  const { zoom } = useViewport();
  const isDot = zoom < 0.4;

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
        {isDot ? (
          <div className="resource-node resource-node--dot" data-selected={selected ? "true" : undefined}>
            <span className="an-dot" style={{ "--dot-colour": data.style?.dotColour ?? "#4a4aff" } as CSSProperties} />
          </div>
        ) : (
          <div
            className="resource-node resource-node--face"
            data-kind={data.resourceKind ?? "binary"}
            data-selected={selected ? "true" : undefined}
            style={{
              "--node-bg": data.style?.bgColour,
              "--node-text": data.style?.textColour,
              "--node-accent": data.style?.dotColour,
            } as CSSProperties}
          >
            <ResourceFace
              resourceKind={data.resourceKind}
              absolutePath={data.absolutePath}
              content={data.content}
              thumbnail={data.style?.thumbnail}
              title={data.title}
            />
            <div className="resource-node__title-bar">
              <span
                className="resource-node__title"
                style={{ color: data.style?.textColour } as CSSProperties}
              >
                {data.title}
              </span>
            </div>
          </div>
        )}
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

function ResourceFace({ resourceKind, absolutePath, content, thumbnail, title }: {
  resourceKind?: string;
  absolutePath?: string;
  content?: string;
  thumbnail?: string;
  title: string;
}) {
  if (thumbnail) {
    return (
      <img
        className="resource-node__image"
        src={thumbnail}
        alt={title}
        draggable={false}
      />
    );
  }

  if (resourceKind === "image" && absolutePath) {
    return (
      <img
        className="resource-node__image"
        src={`asset://localhost/${encodeURI(absolutePath)}`}
        alt={title}
        draggable={false}
      />
    );
  }

  if ((resourceKind === "markdown" || resourceKind === "text") && content) {
    return (
      <div className="resource-node__text-preview">
        {content}
      </div>
    );
  }

  if (resourceKind === "pdf") {
    return (
      <div className="resource-node__file-icon">
        <span className="resource-node__file-badge">PDF</span>
      </div>
    );
  }

  return (
    <div className="resource-node__file-icon">
      <span className="resource-node__file-badge">{resourceKind ?? "FILE"}</span>
    </div>
  );
}
