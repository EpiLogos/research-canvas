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
  id?: string;
  graphNodeId?: string;
}

interface CreateGroupNodeInput {
  title: string;
  x: number;
  y: number;
  id?: string;
  graphNodeId?: string;
}

interface CreateResourceNodeInput {
  absolutePath: string;
  relativePath: string;
  resourceKind: "markdown" | "image" | "pdf" | "text" | "binary" | "directory" | "url" | "audio" | "video";
  title: string;
  id?: string;
  graphNodeId?: string;
}

interface ConnectNodesInput {
  relationKind: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandleId?: string;
  targetHandleId?: string;
  directionality?: CanvasEdge["directionality"];
}

interface UpdateEdgeConnectionInput {
  directionality?: CanvasEdge["directionality"];
  sourceHandleId?: string;
  sourceNodeId?: string;
  targetHandleId?: string;
  targetNodeId?: string;
}

export interface CanvasStoreState {
  cycleEdgeDirectionality: (edgeId: string) => void;
  connectNodes: (input: ConnectNodesInput) => CanvasEdge;
  createGroupNode: (input: CreateGroupNodeInput) => CanvasNode;
  createNoteNode: (input: CreateNoteNodeInput) => CanvasNode;
  createResourceNode: (input: CreateResourceNodeInput) => CanvasNode;
  deleteEdge: (edgeId: string) => void;
  deleteNode: (nodeId: string) => void;
  duplicateNode: (nodeId: string, overrides?: { id?: string; graphNodeId?: string }) => CanvasNode | undefined;
  edges: CanvasEdge[];
  hydrate: (snapshot: CanvasSnapshot) => void;
  nodes: CanvasNode[];
  selectedNodeId: string | null;
  serialize: () => CanvasSnapshot;
  setSelectedNodeId: (nodeId: string | null) => void;
  updateEdgeConnection: (edgeId: string, input: UpdateEdgeConnectionInput) => void;
  updateEdgeRelationKind: (edgeId: string, relationKind: string) => void;
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
  updateNodeSize: (nodeId: string, size: { width: number; height: number }) => void;
  updateNodeTitle: (nodeId: string, title: string) => void;
  toggleEdgeSequencing: (edgeId: string) => void;
  updateEdgeSequencePriority: (edgeId: string, priority: number) => void;
  updateNodeSequenceCaption: (nodeId: string, caption: string | null) => void;
  setNodeSequenceViewport: (nodeId: string, viewport: { x: number; y: number; zoom: number } | null) => void;
}

const defaultEdgeStyle = {
  dashed: false,
  stroke: "#f0b45a",
  width: 2
} as const;

export function createCanvasStore({ canvasId }: CreateCanvasStoreOptions) {
  return createStore<CanvasStoreState>((set, get) => ({
    cycleEdgeDirectionality: (edgeId) => {
      set((state) => ({
        edges: state.edges.map((edge) =>
          edge.id === edgeId
            ? {
                ...edge,
                directionality: nextDirectionality(edge.directionality),
                updatedAt: now()
              }
            : edge
        )
      }));
    },
    connectNodes: ({
      relationKind,
      sourceNodeId,
      targetNodeId,
      sourceHandleId,
      targetHandleId,
      directionality = "forward"
    }) => {
      const edge = edgeSchema.parse({
        id: crypto.randomUUID(),
        canvasId,
        sourceNodeId,
        targetNodeId,
        sourceHandleId,
        targetHandleId,
        relationKind,
        directionality,
        label: relationKind,
        note: "",
        style: defaultEdgeStyle,
        createdAt: now(),
        updatedAt: now()
      });

      set((state) => ({ edges: [...state.edges, edge] }));
      return edge;
    },
    createNoteNode: ({ content, title, id, graphNodeId }) => {
      const node = nodeSchema.parse({
        id: id ?? crypto.randomUUID(),
        graphNodeId: graphNodeId ?? null,
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
    createGroupNode: ({ title, x, y, id, graphNodeId }) => {
      const node = nodeSchema.parse({
        id: id ?? crypto.randomUUID(),
        graphNodeId: graphNodeId ?? null,
        canvasId,
        type: "group",
        title,
        position: { x, y },
        size: { width: 320, height: 240 },
        summary: "",
        color: "#334155",
        childNodeIds: [],
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
      title,
      id,
      graphNodeId
    }) => {
      const node = nodeSchema.parse({
        id: id ?? crypto.randomUUID(),
        graphNodeId: graphNodeId ?? null,
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
    deleteEdge: (edgeId) =>
      set((state) => ({
        edges: state.edges.filter((e) => e.id !== edgeId),
      })),
    deleteNode: (nodeId) =>
      set((state) => ({
        nodes: state.nodes.filter((n) => n.id !== nodeId),
        edges: state.edges.filter(
          (e) => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId,
        ),
      })),
    duplicateNode: (nodeId, overrides) => {
      const state = get();
      const original = state.nodes.find((n) => n.id === nodeId);
      if (!original) return undefined;
      const copy = {
        ...original,
        id: overrides?.id ?? crypto.randomUUID(),
        // Never inherit the original's graphNodeId: each canvas node must map
        // 1:1 to its OWN Neo4j GraphNode (WS4a invariant). The context layer
        // mints a real graphNodeId via transport.createGraphNode and passes it
        // back as overrides.graphNodeId; if no override is supplied the copy
        // starts with null (identical to how createNoteNode behaves when no
        // graphNodeId is provided).
        graphNodeId: overrides?.graphNodeId ?? null,
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
    updateEdgeConnection: (edgeId, input) => {
      set((state) => ({
        edges: state.edges.map((edge) =>
          edge.id === edgeId
            ? {
                ...edge,
                directionality: input.directionality ?? edge.directionality,
                sourceHandleId: input.sourceHandleId ?? edge.sourceHandleId,
                sourceNodeId: input.sourceNodeId ?? edge.sourceNodeId,
                targetHandleId: input.targetHandleId ?? edge.targetHandleId,
                targetNodeId: input.targetNodeId ?? edge.targetNodeId,
                updatedAt: now()
              }
            : edge
        )
      }));
    },
    updateEdgeRelationKind: (edgeId, relationKind) => {
      const nextRelationKind = relationKind.trim();
      if (!nextRelationKind) {
        return;
      }

      set((state) => ({
        edges: state.edges.map((edge) =>
          edge.id === edgeId
            ? {
                ...edge,
                label: nextRelationKind,
                relationKind: nextRelationKind,
                updatedAt: now(),
              }
            : edge,
        )
      }));
    },
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
      const node = get().nodes.find((n) => n.id === nodeId);
      if (!node) {
        console.warn(`updateNodeContent: node ${nodeId} not found`);
        return;
      }
      if (node.type !== "note") {
        console.warn(`updateNodeContent: node ${nodeId} is type "${node.type}", not "note" — content not updated`);
        return;
      }
      const nextTitle = deriveNoteTitle(content);
      const nextSummary = deriveNoteSummary(content);
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                content,
                summary: nextSummary,
                title: nextTitle,
                updatedAt: now(),
              }
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
    updateNodeSize: (nodeId, size) =>
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId ? { ...n, size, updatedAt: now() } : n,
        ),
      })),
    updateNodeTitle: (nodeId, title) =>
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId ? { ...n, title, updatedAt: now() } : n,
        ),
      })),
    toggleEdgeSequencing: (edgeId) => {
      set((state) => ({
        edges: state.edges.map((edge) =>
          edge.id === edgeId
            ? { ...edge, sequencing: !edge.sequencing, updatedAt: now() }
            : edge
        ),
      }));
    },
    updateEdgeSequencePriority: (edgeId, priority) => {
      set((state) => ({
        edges: state.edges.map((edge) =>
          edge.id === edgeId
            ? { ...edge, sequencePriority: priority, updatedAt: now() }
            : edge
        ),
      }));
    },
    updateNodeSequenceCaption: (nodeId, caption) => {
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId ? { ...n, sequenceCaption: caption, updatedAt: now() } : n
        ),
      }));
    },
    setNodeSequenceViewport: (nodeId, viewport) => {
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId ? { ...n, sequenceViewport: viewport, updatedAt: now() } : n
        ),
      }));
    },
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

function deriveNoteTitle(content: string) {
  const firstMeaningfulLine = content
    .split(/\r?\n/u)
    .map((line) => line.replace(/^#{1,6}\s+/u, "").trim())
    .find((line) => line.length > 0);

  if (!firstMeaningfulLine) {
    return "Untitled note";
  }

  return firstMeaningfulLine.length > 64
    ? `${firstMeaningfulLine.slice(0, 61).trimEnd()}...`
    : firstMeaningfulLine;
}

function deriveNoteSummary(content: string) {
  const summary = content
    .replace(/^#{1,6}\s+/gmu, "")
    .replace(/\s+/gu, " ")
    .trim();

  return summary.length > 140 ? `${summary.slice(0, 137).trimEnd()}...` : summary;
}

function nextDirectionality(directionality: CanvasEdge["directionality"]) {
  switch (directionality) {
    case "forward":
      return "backward";
    case "backward":
      return "bidirectional";
    case "bidirectional":
      return "none";
    case "none":
    default:
      return "forward";
  }
}

function now() {
  return new Date().toISOString();
}

export function entityTypeForNodeType(
  type: "note" | "group" | "resource" | "portal"
): "Work" | "Source" {
  return type === "resource" ? "Source" : "Work";
}
