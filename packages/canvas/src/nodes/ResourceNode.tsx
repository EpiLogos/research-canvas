import { Handle, NodeResizer, Position, type Node, type NodeProps } from "@xyflow/react";
import { AdaptiveNode } from "./AdaptiveNode";
import type { AdaptiveNodeStyle } from "./AdaptiveNode";

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
      <NodeResizer
        minWidth={120}
        minHeight={60}
        isVisible={selected}
        lineStyle={{ borderColor: "rgba(39, 174, 96, 0.5)" }}
        handleStyle={{ borderColor: "rgba(39, 174, 96, 0.8)", background: "#0a140a" }}
      />
      <Handle type="target" position={Position.Top} className="flow-handle" />
      <AdaptiveNode
        nodeType="resource"
        title={data.title}
        summary={data.summary}
        selected={selected}
        style={data.style}
      />
      <Handle type="source" position={Position.Bottom} className="flow-handle" />
    </>
  );
}
