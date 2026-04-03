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

interface GroupNodeData {
  title: string;
  summary?: string;
  style?: AdaptiveNodeStyle;
  [key: string]: unknown;
}

export type GroupNodeType = Node<GroupNodeData, "group">;

export function GroupNode({ data, selected }: NodeProps<GroupNodeType>) {
  return (
    <>
      <NodeResizeControl
        minWidth={180}
        minHeight={120}
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
          nodeType="group"
          title={data.title}
          summary={data.summary}
          selected={selected}
          style={data.style}
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
