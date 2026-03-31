import "@xyflow/react/dist/style.css";

import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node
} from "@xyflow/react";
import type { ComponentType } from "react";
import { useEffect, useState } from "react";

import type { CanvasEdge, CanvasNode } from "@research-canvas/schema";

import { AnnotatedEdge } from "./edges/AnnotatedEdge";
import { ContextMenu } from "./components/ContextMenu";
import { FuzzyFilePicker, type FileEntry } from "./components/FuzzyFilePicker";
import { GroupNode } from "./nodes/GroupNode";
import { NoteNode } from "./nodes/NoteNode";
import { ResourceNode } from "./nodes/ResourceNode";

interface CanvasViewProps {
  edges: CanvasEdge[];
  nodes: CanvasNode[];
  onMoveNode?: (nodeId: string, position: { x: number; y: number }) => void;
  onSelectNode?: (nodeId: string) => void;
  selectedNodeId?: string | null;
  onDeleteNode?: (nodeId: string) => void;
  onDuplicateNode?: (nodeId: string) => void;
  onCreateNote?: (position?: { x: number; y: number }) => void;
  onCreateGroup?: (position?: { x: number; y: number }) => void;
  onCreateResourceFromFile?: (entry: FileEntry, position?: { x: number; y: number }) => void;
  fileEntries?: FileEntry[];
  onNodeDoubleClick?: (nodeId: string) => void;
}

const nodeTypes: Record<string, ComponentType<any>> = {
  group: GroupNode,
  note: NoteNode,
  resource: ResourceNode
};

const edgeTypes: Record<string, ComponentType<any>> = {
  annotated: AnnotatedEdge
};

export function CanvasView({
  edges,
  nodes,
  onMoveNode,
  onSelectNode,
  selectedNodeId,
  onDeleteNode,
  onDuplicateNode,
  onCreateNote,
  onCreateGroup,
  onCreateResourceFromFile,
  fileEntries,
  onNodeDoubleClick
}: CanvasViewProps) {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    kind: "canvas" | "node";
    nodeId?: string;
    canvasPos?: { x: number; y: number };
  } | null>(null);

  const [showFilePicker, setShowFilePicker] = useState<{
    x: number;
    y: number;
    canvasPos?: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.target as HTMLElement)?.closest?.(".react-flow")) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        const selected = nodes.find((n) => n.id === selectedNodeId);
        if (selected) onDeleteNode?.(selected.id);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "d") {
        e.preventDefault();
        const selected = nodes.find((n) => n.id === selectedNodeId);
        if (selected) onDuplicateNode?.(selected.id);
      }
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        onCreateNote?.();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [nodes, selectedNodeId, onDeleteNode, onDuplicateNode, onCreateNote]);

  const flowNodes: Node[] = nodes.map((node) => ({
    id: node.id,
    type: node.type === "portal" ? "group" : node.type,
    position: node.position,
    data: {
      summary:
        node.type === "resource"
          ? node.relativePath
          : node.type === "note"
            ? node.content
            : node.summary,
      title: node.title
    },
    draggable: true,
    selectable: true,
    selected: node.id === selectedNodeId
  }));

  const flowEdges: Edge[] = edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    type: "annotated",
    data: {
      relationKind: edge.relationKind,
      note: edge.note
    },
    markerEnd: {
      type: MarkerType.ArrowClosed
    },
    selectable: true
  }));

  return (
    <div className="canvas-flow">
      <ReactFlow
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        edgeTypes={edgeTypes}
        edges={flowEdges}
        fitView
        nodes={flowNodes}
        nodeTypes={nodeTypes}
        nodesDraggable
        nodesFocusable
        onNodeClick={(_event, node) => {
          onSelectNode?.(node.id);
        }}
        onNodeDragStop={(_event, node) => {
          onMoveNode?.(node.id, node.position);
        }}
        onNodeDoubleClick={(_e, node) => {
          onNodeDoubleClick?.(node.id);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({ x: e.clientX, y: e.clientY, kind: "canvas" });
        }}
        onNodeContextMenu={(e, node) => {
          e.preventDefault();
          setContextMenu({ x: e.clientX, y: e.clientY, kind: "node", nodeId: node.id });
        }}
        panOnDrag
      >
        <Background color="rgba(244, 232, 208, 0.08)" gap={24} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>

      {contextMenu && contextMenu.kind === "canvas" && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            { label: "Add note", shortcut: "N", action: () => onCreateNote?.() },
            {
              label: "Add resource from file…",
              shortcut: "R",
              action: () => {
                setShowFilePicker({ x: contextMenu.x, y: contextMenu.y });
                setContextMenu(null);
              },
            },
            { label: "Add group", shortcut: "G", action: () => onCreateGroup?.() },
            { separator: true },
            { label: "Select all", shortcut: "⌘A", action: () => {} },
          ]}
        />
      )}

      {contextMenu && contextMenu.kind === "node" && contextMenu.nodeId && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            {
              header: true,
              label: flowNodes.find((n) => n.id === contextMenu.nodeId)?.data?.title as string ?? "Node",
            },
            { separator: true },
            {
              label: "Open content",
              shortcut: "↵",
              action: () => onNodeDoubleClick?.(contextMenu.nodeId!),
            },
            {
              label: "Duplicate",
              shortcut: "⌘D",
              action: () => onDuplicateNode?.(contextMenu.nodeId!),
            },
            { separator: true },
            {
              label: "Delete",
              danger: true,
              shortcut: "⌫",
              action: () => onDeleteNode?.(contextMenu.nodeId!),
            },
          ]}
        />
      )}

      {showFilePicker && (
        <FuzzyFilePicker
          x={showFilePicker.x}
          y={showFilePicker.y}
          entries={fileEntries ?? []}
          onSelect={(entry) => {
            onCreateResourceFromFile?.(entry);
            setShowFilePicker(null);
          }}
          onClose={() => setShowFilePicker(null)}
        />
      )}
    </div>
  );
}
