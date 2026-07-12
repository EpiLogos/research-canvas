import {
  Handle,
  NodeResizeControl,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import type { GraphNodeContract } from "@research-canvas/schema";
import type { NodeVisualStyle } from "./nodeVisualStyle";
import { KnowledgeCard } from "./KnowledgeCard";
import { resolveKnowledgeCardPresentation } from "../presentation/cardPresentation";
import {
  HANDLE_POSITIONS,
  HANDLE_SIDES,
  sourceHandleId,
  targetHandleId,
} from "./nodeHandles";

interface GroupNodeData {
  nodeType?: "group" | "portal";
  title: string;
  summary?: string;
  graph?: GraphNodeContract;
  style?: NodeVisualStyle;
  [key: string]: unknown;
}

export type GroupNodeType = Node<GroupNodeData, "group">;

export function GroupNode({ data, selected }: NodeProps<GroupNodeType>) {
  const presentation = resolveKnowledgeCardPresentation({
    title: data.title,
    summary: data.summary ?? "",
    dotColour: data.style?.dotColour,
    bgColour: data.style?.bgColour,
    textColour: data.style?.textColour,
    thumbnail: data.style?.thumbnail,
  }, data.graph);
  return (
    <>
      <NodeResizeControl
        minWidth={180}
        minHeight={120}
        position="bottom-right"
        className="node-resize-control node-resize-control--bottom-right"
        style={{ display: selected ? "flex" : "none" }}
      >
        <div className="node-resize-grip" />
      </NodeResizeControl>
      <NodeResizeControl
        minWidth={180}
        minHeight={120}
        position="bottom-left"
        className="node-resize-control node-resize-control--bottom-left"
        style={{ display: selected ? "flex" : "none" }}
      >
        <div className="node-resize-grip" />
      </NodeResizeControl>
      <NodeResizeControl
        minWidth={180}
        minHeight={120}
        position="top-right"
        className="node-resize-control node-resize-control--top-right"
        style={{ display: selected ? "flex" : "none" }}
      >
        <div className="node-resize-grip" />
      </NodeResizeControl>
      <NodeResizeControl
        minWidth={180}
        minHeight={120}
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
        <div className="group-node" data-node-type={data.nodeType ?? "group"} data-selected={selected ? "true" : undefined}>
          <KnowledgeCard presentation={presentation} />
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
