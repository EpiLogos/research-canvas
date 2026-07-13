import "@xyflow/react/dist/style.css";

import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type EdgeMarker,
  type Connection,
  ConnectionMode,
  type Edge,
  type Node,
  type NodeChange,
  type NodeTypes
} from "@xyflow/react";
import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  Annotation,
  AnnotationPoint,
  CanvasEdge,
  CanvasNode,
} from "@research-canvas/schema";

import { AnnotationLayer } from "./annotations/AnnotationLayer";
import { AnnotatedEdge } from "./edges/AnnotatedEdge";
import { SequenceMap } from "./sequences/SequenceMap";
import { walkSequenceGraph } from "./sequences/walkSequenceGraph";
import { ContextMenu } from "./components/ContextMenu";
import { FuzzyFilePicker, type FileEntry } from "./components/FuzzyFilePicker";
import { GroupNode } from "./nodes/GroupNode";
import { NoteNode } from "./nodes/NoteNode";
import { ResourceNode } from "./nodes/ResourceNode";
import { defaultSourceHandleId, defaultTargetHandleId } from "./nodes/nodeHandles";

interface CanvasViewProps {
  edges: CanvasEdge[];
  nodes: CanvasNode[];
  onMoveNode?: (nodeId: string, position: { x: number; y: number }) => void;
  onSelectEdge?: (edgeId: string | null) => void;
  onSelectNode?: (nodeId: string | null) => void;
  selectedNodeId?: string | null;
  selectedEdgeId?: string | null;
  onDeleteNode?: (nodeId: string) => void;
  onDuplicateNode?: (nodeId: string) => void;
  onCreateNote?: (position?: { x: number; y: number }) => void;
  onCreateGroup?: (position?: { x: number; y: number }) => void;
  onCreateResourceFromFile?: (entry: FileEntry, position: { x: number; y: number }) => void;
  fileEntries?: FileEntry[];
  onNodeDoubleClick?: (nodeId: string) => void;
  onConnectNodes?: (input: {
    sourceNodeId: string;
    targetNodeId: string;
    relationKind: string;
    sourceHandleId?: string;
    targetHandleId?: string;
    directionality?: CanvasEdge["directionality"];
  }) => void;
  onReconnectEdge?: (
    edgeId: string,
    input: {
      sourceNodeId: string;
      targetNodeId: string;
      sourceHandleId?: string;
      targetHandleId?: string;
    }
  ) => void;
  onCycleEdgeDirectionality?: (edgeId: string) => void;
  onDeleteEdge?: (edgeId: string) => void;
  onUpdateEdgeRelationKind?: (edgeId: string, relationKind: string) => void;
  onResizeNode?: (nodeId: string, width: number, height: number) => void;
  onUpdateNoteContent?: (nodeId: string, content: string) => void;
  leftPanelOpen?: boolean;
  rightPanelOpen?: boolean;
  annotations?: Annotation[];
  drawingEnabled?: boolean;
  onCreateStroke?: (points: AnnotationPoint[]) => void;
  onRegisterFlyToNode?: (flyTo: (nodeId: string, viewport?: { x: number; y: number; zoom: number }) => void) => void;
  onRegisterFlyToEdge?: (flyTo: (edgeId: string, viewport?: { x: number; y: number; zoom: number }) => void) => void;
  onRegisterCaptureViewport?: (
    capture: () => { x: number; y: number; zoom: number }
  ) => void;
  onToggleEdgeSequencing?: (edgeId: string) => void;
  onPlaySequence?: () => void;
  /** Host-specific URL adapter for local resource thumbnails (e.g. Tauri asset://). */
  assetUrlForPath?: (absolutePath: string) => string;
  /** Normalizes stored thumbnail URLs owned by the desktop host. */
  resolveAssetUrl?: (url: string) => string;
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
  onSelectEdge,
  onSelectNode,
  selectedNodeId,
  selectedEdgeId,
  onDeleteNode,
  onDuplicateNode,
  onCreateNote,
  onCreateGroup,
  onCreateResourceFromFile,
  fileEntries,
  onNodeDoubleClick,
  onConnectNodes,
  onReconnectEdge,
  onCycleEdgeDirectionality,
  onDeleteEdge,
  onUpdateEdgeRelationKind,
  onResizeNode,
  onUpdateNoteContent,
  leftPanelOpen,
  rightPanelOpen,
  annotations = [],
  drawingEnabled = false,
  onCreateStroke,
  onRegisterFlyToNode,
  onRegisterFlyToEdge,
  onRegisterCaptureViewport,
  onToggleEdgeSequencing,
  onPlaySequence,
  assetUrlForPath,
  resolveAssetUrl,
}: CanvasViewProps) {
  const { fitView, getViewport, getZoom, screenToFlowPosition, setCenter, setViewport } =
    useReactFlow();

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
        void setViewport(viewport, { duration: 500 });
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

  const flyToEdge = useCallback(
    (edgeId: string, viewport?: { x: number; y: number; zoom: number }) => {
      if (viewport) {
        void setViewport(viewport, { duration: 500 });
        return;
      }

      const edge = edges.find((candidate) => candidate.id === edgeId);
      if (!edge) {
        return;
      }

      const source = nodes.find((candidate) => candidate.id === edge.sourceNodeId);
      const target = nodes.find((candidate) => candidate.id === edge.targetNodeId);
      if (!source || !target) {
        return;
      }

      const sourceCenter = {
        x: source.position.x + (source.size?.width ?? 200) / 2,
        y: source.position.y + (source.size?.height ?? 140) / 2,
      };
      const targetCenter = {
        x: target.position.x + (target.size?.width ?? 200) / 2,
        y: target.position.y + (target.size?.height ?? 140) / 2,
      };

      setCenter((sourceCenter.x + targetCenter.x) / 2, (sourceCenter.y + targetCenter.y) / 2, {
        duration: 500,
        zoom: Math.max(1, getZoom()),
      });
    },
    [edges, nodes, setCenter, setViewport, getZoom]
  );

  useEffect(() => {
    onRegisterFlyToNode?.(flyToNode);
  }, [flyToNode, onRegisterFlyToNode]);

  useEffect(() => {
    onRegisterFlyToEdge?.(flyToEdge);
  }, [flyToEdge, onRegisterFlyToEdge]);

  useEffect(() => {
    onRegisterCaptureViewport?.(() => getViewport());
  }, [getViewport, onRegisterCaptureViewport]);

  const sequenceGraph = useMemo(
    () => walkSequenceGraph(nodes, edges),
    [nodes, edges]
  );

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
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const closeFilePicker = useCallback(() => setShowFilePicker(null), []);

  useEffect(() => {
    if (!editingNodeId) {
      return;
    }

    const editingNode = nodes.find((node) => node.id === editingNodeId);
    if (!editingNode || editingNode.type !== "note") {
      setEditingNodeId(null);
    }
  }, [editingNodeId, nodes]);

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      onConnectNodes?.({
        sourceNodeId: connection.source,
        targetNodeId: connection.target,
        relationKind: "UNCLASSIFIED_RESEARCH_CONNECTION",
        sourceHandleId: connection.sourceHandle ?? undefined,
        targetHandleId: connection.targetHandle ?? undefined,
        directionality: "forward",
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }
      if (!(e.target as HTMLElement)?.closest?.(".react-flow")) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        const selected = nodes.find((n) => n.id === selectedNodeId);
        if (selected) {
          onDeleteNode?.(selected.id);
        } else if (selectedEdgeId) {
          onDeleteEdge?.(selectedEdgeId);
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "d") {
        e.preventDefault();
        const selected = nodes.find((n) => n.id === selectedNodeId);
        if (selected) onDuplicateNode?.(selected.id);
      }
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        onCreateNote?.(getViewportCenter());
      }
      if (e.key === "p" && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        if (edges.some((edge) => edge.sequencing)) {
          onPlaySequence?.();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    nodes,
    edges,
    selectedNodeId,
    selectedEdgeId,
    onDeleteEdge,
    onDeleteNode,
    onDuplicateNode,
    onCreateNote,
    onPlaySequence,
    getViewportCenter,
  ]);

  const flowNodes: Node[] = nodes.map((node) => ({
    id: node.id,
    type: node.type === "portal" ? "group" : node.type,
    position: node.position,
    width: node.size?.width,
    height: node.size?.height,
    data: {
      summary:
        node.summary,
      nodeType: node.type === "portal" ? "portal" : node.type === "group" ? "group" : undefined,
      title: node.title,
      graph: node.graph,
      content: node.type === "note" ? node.content : node.type === "resource" ? node.relativePath : undefined,
      tags: node.type === "note" ? node.tags : undefined,
      resourceKind: node.type === "resource" ? node.resourceKind : undefined,
      absolutePath: node.type === "resource" ? node.absolutePath : undefined,
      isEditing: node.type === "note" ? node.id === editingNodeId : false,
      onContentChange:
        node.type === "note"
          ? (content: string) => onUpdateNoteContent?.(node.id, content)
          : undefined,
      onStartEditing:
        node.type === "note"
          ? () => {
              onSelectNode?.(node.id);
              onSelectEdge?.(null);
              setEditingNodeId(node.id);
            }
          : undefined,
      onStopEditing:
        node.type === "note"
          ? () => setEditingNodeId((current) => (current === node.id ? null : current))
          : undefined,
      style: {
        dotColour: node.dotColour ?? undefined,
        bgColour: node.bgColour ?? undefined,
        textColour: node.textColour ?? undefined,
        thumbnail: node.thumbnail
          ? (resolveAssetUrl?.(node.thumbnail) ?? node.thumbnail)
          : (node.type === "resource" && node.resourceKind === "image" && node.absolutePath
            ? assetUrlForPath?.(node.absolutePath)
            : undefined),
      },
    },
    draggable: true,
    selectable: true,
    selected: node.id === selectedNodeId
  }));

  const flowEdges: Edge[] = edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceNodeId,
    sourceHandle: edge.sourceHandleId ?? defaultSourceHandleId(),
    target: edge.targetNodeId,
    targetHandle: edge.targetHandleId ?? defaultTargetHandleId(),
    type: "annotated",
    data: {
      directionality: edge.directionality,
      relationKind: edge.relationKind,
      note: edge.note,
      sequencing: edge.sequencing,
      onSelect: () => {
        onSelectNode?.(null);
        onSelectEdge?.(edge.id);
      },
      onCycleDirectionality: () => onCycleEdgeDirectionality?.(edge.id),
      onDelete: () => onDeleteEdge?.(edge.id),
      onUpdateRelationKind: (relationKind: string) =>
        onUpdateEdgeRelationKind?.(edge.id, relationKind),
      selected: edge.id === selectedEdgeId
    },
    ...(edge.sequencing
      ? { markerEnd: { type: MarkerType.ArrowClosed } }
      : edgeMarkers(edge.directionality)),
    selected: edge.id === selectedEdgeId,
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
      ...(nodes.find((candidate) => candidate.id === nodeId)?.type === "note"
        ? [
            {
              type: "item" as const,
              label: "Edit note",
              onClick: () => {
                onSelectNode?.(nodeId);
                onSelectEdge?.(null);
                setEditingNodeId(nodeId);
              },
            },
          ]
        : []),
      { type: "item" as const, label: "Draw edge →", onClick: () => {} },
      { type: "separator" as const },
      { type: "item" as const, label: "Duplicate", shortcut: "⌘D", onClick: () => onDuplicateNode?.(nodeId) },
      { type: "separator" as const },
      { type: "item" as const, label: "Customise…", onClick: () => {} },
      { type: "separator" as const },
      { type: "item" as const, label: "Delete", shortcut: "⌫", danger: true, onClick: () => onDeleteNode?.(nodeId) },
    ];
  }, [
    contextMenu,
    flowNodes,
    nodes,
    onNodeDoubleClick,
    onDuplicateNode,
    onDeleteNode,
    onSelectEdge,
    onSelectNode,
  ]);

  return (
    <div
      className="canvas-flow"
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
        onDragOver={(e: React.DragEvent) => {
          // Always prevent default to allow drops; validate content in onDrop
          // (WKWebView may not reliably support custom MIME types in DataTransfer)
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e: React.DragEvent) => {
          e.preventDefault();
          // Try custom type first, fall back to text/plain (WKWebView compatibility)
          const raw = e.dataTransfer.getData("application/x-canvas-entry")
            || e.dataTransfer.getData("text/plain");
          if (!raw) return;
          try {
            const entry = JSON.parse(raw) as {
              absolutePath?: string;
              id: string;
              kind: string;
              name: string;
              relativePath: string;
            };
            if (!entry.id || !entry.name || !entry.relativePath) return;
            const canvasPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
            onCreateResourceFromFile?.(
              {
                absolutePath: entry.absolutePath,
                id: entry.id,
                kind: entry.kind,
                name: entry.name,
                path: entry.relativePath,
                relativePath: entry.relativePath,
              },
              canvasPos
            );
          } catch {
            // not a canvas entry payload
          }
        }}
        onPaneClick={() => {
          setEditingNodeId(null);
          onSelectNode?.(null);
          onSelectEdge?.(null);
        }}
        onNodeClick={(_event, node) => {
          setEditingNodeId((current) => (current === node.id ? current : null));
          onSelectNode?.(node.id);
          onSelectEdge?.(null);
        }}
        onNodeDrag={(_event, node) => {
          onMoveNode?.(node.id, node.position);
        }}
        onNodeDragStop={(_event, node) => {
          onMoveNode?.(node.id, node.position);
        }}
        onNodeDoubleClick={(_e, node) => {
          setEditingNodeId(null);
          onNodeDoubleClick?.(node.id);
        }}
        onEdgeClick={(_event, edge) => {
          setEditingNodeId(null);
          onSelectNode?.(null);
          onSelectEdge?.(edge.id);
        }}
        onNodesChange={handleNodesChange}
        onConnect={handleConnect}
        onReconnect={(oldEdge, newConnection) => {
          if (!newConnection.source || !newConnection.target) {
            return;
          }
          onReconnectEdge?.(oldEdge.id, {
            sourceNodeId: newConnection.source,
            targetNodeId: newConnection.target,
            sourceHandleId: newConnection.sourceHandle ?? undefined,
            targetHandleId: newConnection.targetHandle ?? undefined,
          });
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
        {sequenceGraph.nodeSet.size > 0 && (
          <SequenceMap
            graph={sequenceGraph}
            nodes={nodes}
            onClickNode={(nodeId) => flyToNode(nodeId)}
          />
        )}
      </ReactFlow>
      <AnnotationLayer
        annotations={annotations}
        drawingEnabled={drawingEnabled}
        onCreateStroke={(points) => onCreateStroke?.(points)}
      />

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
            ...(edges.some((e) => e.sequencing)
              ? [
                  { type: "separator" as const },
                  {
                    type: "item" as const,
                    label: "Play sequence",
                    shortcut: "P",
                    onClick: () => {
                      onPlaySequence?.();
                      closeContextMenu();
                    },
                  },
                ]
              : []),
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
              label: edges.find((e) => e.id === contextMenu.edgeId)?.sequencing
                ? "Remove from sequence"
                : "Mark as sequence arrow",
              onClick: () => {
                onToggleEdgeSequencing?.(contextMenu.edgeId!);
                closeContextMenu();
              },
            },
            { type: "separator" },
            {
              type: "item",
              label: "Cycle arrow direction",
              onClick: () => {
                onCycleEdgeDirectionality?.(contextMenu.edgeId!);
                closeContextMenu();
              },
            },
            {
              type: "item",
              label: "Delete connection",
              shortcut: "⌫",
              danger: true,
              onClick: () => {
                onDeleteEdge?.(contextMenu.edgeId!);
                onSelectEdge?.(null);
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

function edgeMarkers(directionality: CanvasEdge["directionality"]): {
  markerStart?: EdgeMarker;
  markerEnd?: EdgeMarker;
} {
  const marker = { type: MarkerType.ArrowClosed };

  switch (directionality) {
    case "backward":
      return { markerStart: marker };
    case "bidirectional":
      return { markerStart: marker, markerEnd: marker };
    case "forward":
      return { markerEnd: marker };
    case "none":
    default:
      return {};
  }
}
