import "@xyflow/react/dist/style.css";

import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  ConnectionMode,
  type Edge,
  type Node,
  type NodeChange,
  type NodeTypes
} from "@xyflow/react";
import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  onCreateResourceFromFile?: (entry: FileEntry, position: { x: number; y: number }) => void;
  fileEntries?: FileEntry[];
  onNodeDoubleClick?: (nodeId: string) => void;
  onConnectNodes?: (input: { sourceNodeId: string; targetNodeId: string; relationKind: string }) => void;
  onDeleteEdge?: (edgeId: string) => void;
  onResizeNode?: (nodeId: string, width: number, height: number) => void;
  leftPanelOpen?: boolean;
  rightPanelOpen?: boolean;
  onRegisterFlyToNode?: (flyTo: (nodeId: string, viewport?: { x: number; y: number; zoom: number }) => void) => void;
}

const nodeTypes: NodeTypes = {
  group: GroupNode,
  note: NoteNode,
  resource: ResourceNode
};

const edgeTypes: Record<string, ComponentType<any>> = {
  annotated: AnnotatedEdge
};

export function CanvasView(props: CanvasViewProps) {
  return (
    <ReactFlowProvider>
      <CanvasViewInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasViewInner({
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
  onNodeDoubleClick,
  onConnectNodes,
  onDeleteEdge,
  onResizeNode,
  leftPanelOpen,
  rightPanelOpen,
  onRegisterFlyToNode
}: CanvasViewProps) {
  const { screenToFlowPosition, setCenter, getZoom, fitView } = useReactFlow();

  const getViewportCenter = useCallback(() => {
    const container = document.querySelector('.canvas-flow') as HTMLElement;
    if (!container) return { x: 100, y: 100 };
    const rect = container.getBoundingClientRect();
    return screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    });
  }, [screenToFlowPosition]);

  const prevNodeCountRef = useRef(nodes.length);
  useEffect(() => {
    if (nodes.length > prevNodeCountRef.current) {
      const newest = nodes[nodes.length - 1];
      if (newest) {
        setCenter(newest.position.x + 80, newest.position.y + 60, {
          duration: 350,
          zoom: Math.max(1, getZoom()),
        });
      }
    }
    prevNodeCountRef.current = nodes.length;
  }, [nodes, setCenter, getZoom]);

  useEffect(() => {
    const timer = setTimeout(() => fitView({ padding: 0.15 }), 200);
    return () => clearTimeout(timer);
  }, [leftPanelOpen, rightPanelOpen, fitView]);

  const flyToNode = useCallback(
    (nodeId: string, viewport?: { x: number; y: number; zoom: number }) => {
      if (viewport) {
        setCenter(viewport.x, viewport.y, { duration: 500, zoom: viewport.zoom });
      } else {
        const node = nodes.find((n) => n.id === nodeId);
        if (node) {
          setCenter(
            node.position.x + (node.size?.width ?? 200) / 2,
            node.position.y + (node.size?.height ?? 140) / 2,
            { duration: 500, zoom: Math.max(1, getZoom()) }
          );
        }
      }
    },
    [nodes, setCenter, getZoom]
  );

  useEffect(() => {
    onRegisterFlyToNode?.(flyToNode);
  }, [flyToNode, onRegisterFlyToNode]);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    kind: "canvas" | "node" | "edge";
    nodeId?: string;
    edgeId?: string;
    canvasPos?: { x: number; y: number };
  } | null>(null);

  const [showFilePicker, setShowFilePicker] = useState<{
    x: number;
    y: number;
    canvasPos?: { x: number; y: number };
  } | null>(null);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const closeFilePicker = useCallback(() => setShowFilePicker(null), []);

  const [pendingConnectionSource, setPendingConnectionSource] = useState<string | null>(null);

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      onConnectNodes?.({
        sourceNodeId: connection.source,
        targetNodeId: connection.target,
        relationKind: "reference",
      });
    },
    [onConnectNodes],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const change of changes) {
        if (change.type === "dimensions" && change.resizing && change.dimensions) {
          onResizeNode?.(change.id, change.dimensions.width, change.dimensions.height);
        }
      }
    },
    [onResizeNode],
  );

  const handleNodeMouseDown = useCallback(
    (e: React.MouseEvent, nodeId: string) => {
      if (!e.shiftKey) return;
      e.stopPropagation();
      setPendingConnectionSource(nodeId);
      void pendingConnectionSource; // placeholder — will be wired in Task 11
    },
    [pendingConnectionSource],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }
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
        onCreateNote?.(getViewportCenter());
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [nodes, selectedNodeId, onDeleteNode, onDuplicateNode, onCreateNote, getViewportCenter]);

  const flowNodes: Node[] = nodes.map((node) => ({
    id: node.id,
    type: node.type === "portal" ? "group" : node.type,
    position: node.position,
    width: node.size?.width,
    height: node.size?.height,
    data: {
      summary:
        node.type === "resource"
          ? node.relativePath
          : node.type === "note"
            ? node.content
            : node.summary,
      title: node.title,
      content: node.type === "note" ? node.content : undefined,
      resourceKind: node.type === "resource" ? node.resourceKind : undefined,
      absolutePath: node.type === "resource" ? node.absolutePath : undefined,
      style: {
        dotColour: node.dotColour ?? undefined,
        bgColour: node.bgColour ?? undefined,
        textColour: node.textColour ?? undefined,
        thumbnail: node.thumbnail ?? undefined,
      },
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

  const nodeContextMenuItems = useMemo(() => {
    if (!contextMenu?.nodeId) return [];
    const nodeId = contextMenu.nodeId;
    return [
      {
        type: "header" as const,
        label: flowNodes.find((n) => n.id === nodeId)?.data?.title as string ?? "Node",
      },
      { type: "separator" as const },
      { type: "item" as const, label: "Open content", shortcut: "↵", onClick: () => onNodeDoubleClick?.(nodeId) },
      { type: "item" as const, label: "Draw edge →", onClick: () => {} },
      { type: "separator" as const },
      { type: "item" as const, label: "Duplicate", shortcut: "⌘D", onClick: () => onDuplicateNode?.(nodeId) },
      { type: "separator" as const },
      { type: "item" as const, label: "Customise…", onClick: () => {} },
      { type: "separator" as const },
      { type: "item" as const, label: "Delete", shortcut: "⌫", danger: true, onClick: () => onDeleteNode?.(nodeId) },
    ];
  }, [contextMenu, flowNodes, onNodeDoubleClick, onDuplicateNode, onDeleteNode]);

  return (
    <div
      className="canvas-flow"
      onMouseDown={(e: React.MouseEvent) => {
        const nodeEl = (e.target as HTMLElement).closest?.(".react-flow__node") as HTMLElement | null;
        if (nodeEl && e.shiftKey) {
          const nodeId = nodeEl.dataset["id"];
          if (nodeId) handleNodeMouseDown(e, nodeId);
        }
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-canvas-entry")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={(e) => {
        const raw = e.dataTransfer.getData("application/x-canvas-entry");
        if (!raw) return;
        e.preventDefault();
        try {
          const entry = JSON.parse(raw) as { id: string; name: string; relativePath: string; kind: string };
          const canvasPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
          onCreateResourceFromFile?.({ id: entry.id, name: entry.name, path: entry.relativePath, kind: entry.kind }, canvasPos);
        } catch {
          // malformed drag data — ignore
        }
      }}
    >
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
        onNodesChange={handleNodesChange}
        onConnect={handleConnect}
        onReconnect={(oldEdge, newConnection) => {
          onDeleteEdge?.(oldEdge.id);
          handleConnect(newConnection);
        }}
        reconnectRadius={20}
        connectionMode={ConnectionMode.Loose}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({ x: e.clientX, y: e.clientY, kind: "canvas" });
        }}
        onNodeContextMenu={(e, node) => {
          e.preventDefault();
          e.stopPropagation();
          setContextMenu({ x: e.clientX, y: e.clientY, kind: "node", nodeId: node.id });
        }}
        onEdgeContextMenu={(e, edge) => {
          e.preventDefault();
          e.stopPropagation();
          setContextMenu({ x: e.clientX, y: e.clientY, kind: "edge", edgeId: edge.id });
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
          onClose={closeContextMenu}
          items={[
            { type: "item", label: "Add note", shortcut: "N", onClick: () => onCreateNote?.(getViewportCenter()) },
            {
              type: "item",
              label: "Add resource from file…",
              shortcut: "R",
              onClick: () => {
                setShowFilePicker({ x: contextMenu.x, y: contextMenu.y });
                setContextMenu(null);
              },
            },
            { type: "item", label: "Add group", shortcut: "G", onClick: () => onCreateGroup?.(getViewportCenter()) },
            { type: "item", label: "Paste", shortcut: "⌘V", onClick: () => {} },
            { type: "item", label: "Select all", shortcut: "⌘A", onClick: () => {} },
          ]}
        />
      )}

      {contextMenu?.nodeId && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          items={nodeContextMenuItems}
        />
      )}

      {contextMenu?.kind === "edge" && contextMenu.edgeId && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          items={[
            {
              type: "item",
              label: "Delete connection",
              shortcut: "⌫",
              danger: true,
              onClick: () => {
                onDeleteEdge?.(contextMenu.edgeId!);
                closeContextMenu();
              },
            },
          ]}
        />
      )}

      {showFilePicker && (
        <FuzzyFilePicker
          anchorX={showFilePicker.x}
          anchorY={showFilePicker.y}
          entries={fileEntries ?? []}
          onSelect={(entry) => {
            const canvasPos = screenToFlowPosition({ x: showFilePicker.x, y: showFilePicker.y });
            onCreateResourceFromFile?.(entry, canvasPos);
            setShowFilePicker(null);
          }}
          onClose={closeFilePicker}
        />
      )}
    </div>
  );
}
