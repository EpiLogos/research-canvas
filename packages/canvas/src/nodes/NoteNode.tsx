import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { AdaptiveNode } from "./AdaptiveNode";
import type { AdaptiveNodeStyle } from "./AdaptiveNode";

interface NoteNodeData {
  title: string;
  summary?: string;
  style?: AdaptiveNodeStyle;
  content?: string;
  [key: string]: unknown;
}

export type NoteNodeType = Node<NoteNodeData, "note">;

export function NoteNode({ data, selected }: NodeProps<NoteNodeType>) {
  return (
    <>
      <Handle type="target" position={Position.Top} className="flow-handle" />
      <AdaptiveNode
        nodeType="note"
        title={data.title}
        summary={data.summary}
        selected={selected}
        style={data.style}
      />
      <Handle type="source" position={Position.Bottom} className="flow-handle" />
    </>
  );
}
