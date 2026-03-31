import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { AdaptiveNode } from "./AdaptiveNode";
import type { AdaptiveNodeStyle } from "./AdaptiveNode";

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
      <Handle type="target" position={Position.Top} className="flow-handle" />
      <AdaptiveNode
        nodeType="group"
        title={data.title}
        summary={data.summary}
        selected={selected}
        style={data.style}
      />
      <Handle type="source" position={Position.Bottom} className="flow-handle" />
    </>
  );
}
