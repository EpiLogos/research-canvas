import {
  Handle,
  NodeResizeControl,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { AdaptiveNode } from "./AdaptiveNode";
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
  [key: string]: unknown;
}

export type ResourceNodeType = Node<ResourceNodeData, "resource">;

export function ResourceNode({ data, selected }: NodeProps<ResourceNodeType>) {
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
        <AdaptiveNode
          nodeType="resource"
          title={data.title}
          summary={data.summary}
          selected={selected}
          style={data.style}
          resourceKind={data.resourceKind}
          absolutePath={data.absolutePath}
        />
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
