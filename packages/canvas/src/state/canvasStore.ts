import { createStore } from "zustand/vanilla";

import { edgeSchema, nodeSchema, type CanvasEdge, type CanvasNode } from "@research-canvas/schema";

export interface CanvasSnapshot {
  edges: CanvasEdge[];
  nodes: CanvasNode[];
}

interface CreateCanvasStoreOptions {
  canvasId: string;
}

interface CreateNoteNodeInput {
  content: string;
  title: string;
}

interface CreateResourceNodeInput {
  absolutePath: string;
  relativePath: string;
  resourceKind: "markdown" | "image" | "pdf" | "text" | "binary" | "directory" | "url" | "audio" | "video";
  title: string;
}

interface ConnectNodesInput {
  relationKind: string;
  sourceNodeId: string;
  targetNodeId: string;
}

export interface CanvasStoreState {
  connectNodes: (input: ConnectNodesInput) => CanvasEdge;
  createNoteNode: (input: CreateNoteNodeInput) => CanvasNode;
  createResourceNode: (input: CreateResourceNodeInput) => CanvasNode;
  deleteNode: (nodeId: string) => void;
  duplicateNode: (nodeId: string) => CanvasNode | undefined;
  edges: CanvasEdge[];
  hydrate: (snapshot: CanvasSnapshot) => void;
  nodes: CanvasNode[];
  selectedNodeId: string | null;
  serialize: () => CanvasSnapshot;
  setSelectedNodeId: (nodeId: string | null) => void;
  updateEdgeNote: (edgeId: string, note: string) => void;
  updateNodeContent: (nodeId: string, content: string) => void;
  updateNodePosition: (
    nodeId: string,
    position: { x: number; y: number }
  ) => void;
  updateNodeStyle: (nodeId: string, style: {
    dotColour?: string;
    bgColour?: string;
    textColour?: string;
    thumbnail?: string;
  }) => void;
  updateNodeTitle: (nodeId: string, title: string) => void;
}

const defaultEdgeStyle = {
  dashed: false,
  stroke: "#f0b45a",
  width: 2
} as const;

export function createCanvasStore({ canvasId }: CreateCanvasStoreOptions) {
  return createStore<CanvasStoreState>((set, get) => ({
    connectNodes: ({ relationKind, sourceNodeId, targetNodeId }) => {
      const edge = edgeSchema.parse({
        id: crypto.randomUUID(),
        canvasId,
        sourceNodeId,
        targetNodeId,
        relationKind,
        directionality: "forward",
        label: relationKind,
        note: "",
        style: defaultEdgeStyle,
        createdAt: now(),
        updatedAt: now()
      });

      set((state) => ({ edges: [...state.edges, edge] }));
      return edge;
    },
    createNoteNode: ({ content, title }) => {
      const node = nodeSchema.parse({
        id: crypto.randomUUID(),
        canvasId,
        type: "note",
        title,
        position: nextPosition(get().nodes.length),
        size: { width: 240, height: 160 },
        summary: content,
        content,
        tags: ["note"],
        createdAt: now(),
        updatedAt: now()
      });

      set((state) => ({ nodes: [...state.nodes, node] }));
      return node;
    },
    createResourceNode: ({
      absolutePath,
      relativePath,
      resourceKind,
      title
    }) => {
      const node = nodeSchema.parse({
        id: crypto.randomUUID(),
        canvasId,
        type: "resource",
        title,
        position: nextPosition(get().nodes.length),
        size: { width: 260, height: 180 },
        summary: relativePath,
        resourceKind,
        absolutePath,
        relativePath,
        mimeType: mimeTypeFor(resourceKind),
        fileFingerprint: `${resourceKind}:${relativePath}`,
        createdAt: now(),
        updatedAt: now()
      });

      set((state) => ({ nodes: [...state.nodes, node] }));
      return node;
    },
    deleteNode: (nodeId) =>
      set((state) => ({
        nodes: state.nodes.filter((n) => n.id !== nodeId),
        edges: state.edges.filter(
          (e) => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId,
        ),
      })),
    duplicateNode: (nodeId) => {
      const state = get();
      const original = state.nodes.find((n) => n.id === nodeId);
      if (!original) return undefined;
      const copy = {
        ...original,
        id: crypto.randomUUID(),
        position: { x: original.position.x + 24, y: original.position.y + 24 },
        createdAt: now(),
        updatedAt: now(),
      };
      set((s) => ({ nodes: [...s.nodes, copy] }));
      return copy;
    },
    edges: [],
    hydrate: (snapshot) => {
      set({
        nodes: snapshot.nodes.map((node) => nodeSchema.parse(node)),
        edges: snapshot.edges.map((edge) => edgeSchema.parse(edge))
      });
    },
    nodes: [],
    serialize: () => ({
      nodes: get().nodes,
      edges: get().edges
    }),
    updateNodePosition: (nodeId, position) => {
      set((state) => ({
        nodes: state.nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                position,
                updatedAt: now()
              }
            : node
        )
      }));
    },
    updateEdgeNote: (edgeId, note) => {
      set((state) => ({
        edges: state.edges.map((edge) =>
          edge.id === edgeId
            ? {
                ...edge,
                note,
                updatedAt: now()
              }
            : edge,
        )
      }));
    },
    updateNodeContent: (nodeId, content) => {
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId && n.type === "note"
            ? { ...n, content, summary: content, updatedAt: now() }
            : n,
        ),
      }));
    },
    selectedNodeId: null,
    setSelectedNodeId: (nodeId) => set({ selectedNodeId: nodeId }),
    updateNodeStyle: (nodeId, style) =>
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId ? { ...n, ...style, updatedAt: now() } : n,
        ),
      })),
    updateNodeTitle: (nodeId, title) =>
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId ? { ...n, title, updatedAt: now() } : n,
        ),
      })),
  }));
}

function nextPosition(index: number) {
  return {
    x: 80 + (index % 3) * 240,
    y: 80 + Math.floor(index / 3) * 180
  };
}

function mimeTypeFor(resourceKind: CreateResourceNodeInput["resourceKind"]) {
  switch (resourceKind) {
    case "markdown":
      return "text/markdown";
    case "image":
      return "image/png";
    case "pdf":
      return "application/pdf";
    case "text":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

function now() {
  return new Date().toISOString();
}
