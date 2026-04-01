import { Handle, NodeResizer, Position, type Node, type NodeProps } from "@xyflow/react";
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
      <NodeResizer
        minWidth={120}
        minHeight={60}
        isVisible={selected}
        lineStyle={{ borderColor: "rgba(74, 74, 255, 0.5)" }}
        handleStyle={{ borderColor: "rgba(74, 74, 255, 0.8)", background: "#0e0e22" }}
      />
      <div style={{ width: "100%", height: "100%", position: "relative" }}>
        <Handle type="target" position={Position.Top} className="flow-handle" />
        <AdaptiveNode
          nodeType="note"
          title={data.title}
          summary={data.summary}
          selected={selected}
          style={data.style}
        />
        <Handle type="source" position={Position.Bottom} className="flow-handle" />
      </div>
    </>
  );
}
