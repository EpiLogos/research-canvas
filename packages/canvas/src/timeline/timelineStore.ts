import { createStore, type StoreApi } from "zustand/vanilla";

import type { ArchetypalLighting, ExpandedTimelineNode, GraphNode, GraphRelationship, TimelineDiagnostic, TimelineLane, TimelineLayoutOverride, TimelineView, TimelineViewNode } from "./contracts";
import { tierForPixelsPerYear, type ScaleTier } from "./scale";
import { projectNodes, type TimelineItem, type TimelinePresentation } from "./projection";
import {
  frameStateForNode,
  projectSubTimeline,
  transTemporalHover,
  type TimelineFrameState,
  type TimelineHoverNode,
} from "./frames";
import { buildLitMap, type LitMap } from "./lighting";
import {
  clampPixelsPerYear,
  panByPixels,
  zoomAt,
  type TimelineViewport,
} from "./viewport";

const MIN_INITIAL_VISIBLE_YEARS = 160;
const DOMAIN_PADDING_RATIO = 0.18;

export interface TimelineVerticalPanBounds {
  min: number;
  max: number;
}

/**
 * One entry of the working-set stack (ticket #28, D13 §4.4): a node the user
 * clicked, its real edges, and its neighbour nodes — all property-complete.
 * Clicked nodes accumulate on the stack; unloading removes them. The full
 * graph never floods the timeline.
 */
export interface WorkingSetEntry {
  graphNodeId: string;
  node: GraphNode;
  edges: GraphRelationship[];
  neighbours: GraphNode[];
  loadedAt: number;
}

export interface TimelineStoreState {
  centerYear: number;
  pixelsPerYear: number;
  widthPx: number;
  items: TimelineItem[];
  /** Raw view records retained so a node can be reframed without a reload. */
  nodes: TimelineViewNode[];
  /** The active sub-timeline frame; null means the Earth zero-case. */
  frame: TimelineFrameState | null;
  /** Trans-temporal nodes hovering above the current frame. */
  hovering: TimelineHoverNode[];
  relationships: GraphRelationship[];
  lanes: TimelineLane[];
  diagnostics: TimelineDiagnostic[];
  litMap: LitMap;
  selectedNodeId: string | null;
  lightingOperatorId: string | null;
  /** Transient screen-space camera offset for cards above/below the axis. */
  verticalOffset: number;
  manualViewport: boolean;
  /** Working-set stack (ticket #28): clicked nodes + their real edges/neighbours. */
  workingSet: WorkingSetEntry[];

  viewport: () => TimelineViewport;
  tier: () => ScaleTier;

  setWidth: (px: number) => void;
  hydrate: (view: TimelineView, preserveViewport?: boolean) => void;
  pan: (deltaPx: number) => void;
  panVertical: (deltaPx: number, bounds: TimelineVerticalPanBounds) => void;
  resetVerticalPan: () => void;
  zoom: (factor: number, anchorPx: number) => void;
  setView: (centerYear: number, pixelsPerYear: number) => void;
  setLighting: (lighting: ArchetypalLighting) => void;
  clearLighting: () => void;
  setSelected: (nodeId: string | null) => void;
  setFrameForNode: (nodeId: string | null) => void;
  isNodeExpanded: (graphNodeId: string) => boolean;
  /** Push (or refresh) a node's real expansion onto the working set. */
  expandNode: (expansion: ExpandedTimelineNode) => void;
  /** Remove one clicked node (and its edges) from the working set. */
  collapseNode: (graphNodeId: string) => void;
  /** Pop the most recent entry off the stack. */
  popWorkingSet: () => void;
  clearWorkingSet: () => void;
  updateCardSize: (nodeId: string, size: TimelineCardGeometryUpdate) => void;
  updateCardStyle: (nodeId: string, style: Partial<TimelinePresentation["style"]>) => void;
  applyPersistedLayout: (nodeId: string, layout: TimelineLayoutOverride) => void;
}

export interface TimelineCardGeometryUpdate {
  positionX?: number;
  positionY?: number;
  width: number;
  height: number;
}

interface CreateTimelineStoreOptions {
  initialCenterYear?: number;
  initialPixelsPerYear?: number;
}

export function createTimelineStore(
  options: CreateTimelineStoreOptions = {},
): StoreApi<TimelineStoreState> {
  const hasRememberedViewport =
    options.initialCenterYear !== undefined && options.initialPixelsPerYear !== undefined;
  return createStore<TimelineStoreState>((set, get) => ({
    centerYear: options.initialCenterYear ?? 1700,
    pixelsPerYear: clampPixelsPerYear(options.initialPixelsPerYear ?? 2),
    widthPx: 1000,
    items: [],
    nodes: [],
    frame: null,
    hovering: [],
    relationships: [],
    lanes: [],
    diagnostics: [],
    litMap: new Map(),
    selectedNodeId: null,
    lightingOperatorId: null,
    verticalOffset: 0,
    manualViewport: hasRememberedViewport,
    workingSet: [],

    viewport: () => {
      const s = get();
      return {
        centerYear: s.centerYear,
        pixelsPerYear: s.pixelsPerYear,
        widthPx: s.widthPx,
      };
    },
    tier: () => tierForPixelsPerYear(get().pixelsPerYear),

    setWidth: (px) => {
      const s = get();
      if (!s.manualViewport && s.items.length > 0) {
        set({ widthPx: px, ...fitViewportToItems(s.items, px) });
      } else {
        set({ widthPx: px });
      }
    },
    hydrate: (view, preserveViewport = false) => {
      const nodes = view.nodes;
      const allItems = projectNodes(nodes);
      const relationships = view.relationships ?? [];
      let items = allItems;
      let hovering: TimelineHoverNode[] = [];
      let frame = get().frame;
      if (frame) {
        const current = frameStateForNode(nodes, frame.frameNodeId);
        if (current) {
          items = projectSubTimeline(allItems, relationships, current);
          hovering = transTemporalHover(nodes, relationships, current.frameNodeId);
          frame = current;
        } else {
          // The frame node no longer exists in the loaded view; fall back to
          // the Earth zero-case rather than showing a phantom sub-timeline.
          frame = null;
        }
      }
      // A workspace can survive a graph replacement while the shell still
      // remembers its last camera. Keep a deliberate focus inside this
      // timeline's historical domain, but do not reopen a populated timeline
      // at a completely unrelated century with every card off-screen.
      const keepCamera = preserveViewport || (get().manualViewport && isCameraNearTimeline(items, get().centerYear));
      set({
        items,
        nodes,
        frame,
        hovering,
        // Older local terminal bridges may return a timeline payload from
        // before temporal relationships were added. Treat that as a readable
        // no-link timeline rather than blanking the whole lens.
        relationships,
        lanes: view.lanes,
        diagnostics: view.diagnostics,
        manualViewport: keepCamera,
        ...(!keepCamera && items.length > 0
          ? fitViewportToItems(items, get().widthPx)
          : {}),
      });
    },
    pan: (deltaPx) => {
      const next = panByPixels(get().viewport(), deltaPx);
      set({ centerYear: next.centerYear, manualViewport: true });
    },
    panVertical: (deltaPx, bounds) => {
      const min = Math.min(bounds.min, bounds.max);
      const max = Math.max(bounds.min, bounds.max);
      const next = Math.min(max, Math.max(min, get().verticalOffset + deltaPx));
      set({ verticalOffset: Math.round(next) });
    },
    resetVerticalPan: () => set({ verticalOffset: 0 }),
    zoom: (factor, anchorPx) => {
      const next = zoomAt(get().viewport(), factor, anchorPx);
      set({ centerYear: next.centerYear, pixelsPerYear: next.pixelsPerYear, manualViewport: true });
    },
    setView: (centerYear, pixelsPerYear) =>
      set({ centerYear, pixelsPerYear: clampPixelsPerYear(pixelsPerYear), manualViewport: true }),
    setLighting: (lighting) =>
      set({
        litMap: buildLitMap(lighting),
        lightingOperatorId: lighting.operator.graphNodeId,
      }),
    clearLighting: () => set({ litMap: new Map(), lightingOperatorId: null }),
    setSelected: (nodeId) => set({ selectedNodeId: nodeId }),
    setFrameForNode: (nodeId) => {
      const s = get();
      const allItems = projectNodes(s.nodes);
      if (nodeId === null) {
        set({ frame: null, items: allItems, hovering: [] });
        return;
      }
      const frame = frameStateForNode(s.nodes, nodeId);
      if (!frame) {
        return;
      }
      const items = projectSubTimeline(allItems, s.relationships, frame);
      const hovering = transTemporalHover(s.nodes, s.relationships, nodeId);
      set({
        frame,
        items,
        hovering,
        manualViewport: false,
        ...(frame.window
          ? {
              centerYear: Math.round(
                (frame.window.startYear + frame.window.endYear) / 2,
              ),
            }
          : {}),
      });
    },
    isNodeExpanded: (graphNodeId) =>
      get().workingSet.some((entry) => entry.graphNodeId === graphNodeId),
    expandNode: (expansion) => {
      const now = Date.now();
      const entry: WorkingSetEntry = {
        graphNodeId: expansion.subjectGraphNodeId,
        node: expansion.subject,
        edges: expansion.edges,
        neighbours: expansion.neighbours,
        loadedAt: now,
      };
      set((state) => {
        const existingIndex = state.workingSet.findIndex(
          (existing) => existing.graphNodeId === entry.graphNodeId,
        );
        if (existingIndex === -1) {
          // A stack: the latest click sits on top.
          return { workingSet: [...state.workingSet, entry] };
        }
        // Refresh the existing entry in place (the query result can be newer
        // than the click that stacked it); preserve its stack position.
        const next = [...state.workingSet];
        next[existingIndex] = entry;
        return { workingSet: next };
      });
    },
    collapseNode: (graphNodeId) =>
      set((state) => ({
        workingSet: state.workingSet.filter(
          (entry) => entry.graphNodeId !== graphNodeId,
        ),
      })),
    popWorkingSet: () => {
      const top = get().workingSet[get().workingSet.length - 1];
      if (top) {
        get().collapseNode(top.graphNodeId);
      }
    },
    clearWorkingSet: () => set({ workingSet: [] }),
    updateCardSize: (nodeId, size) =>
      set((state) => ({
        items: state.items.map((item) =>
          item.graphNodeId === nodeId
            ? {
                ...item,
                presentation: {
                  ...item.presentation,
                  offsetY: size.positionY ?? item.presentation.offsetY,
                  width: size.width,
                  height: size.height,
                },
              }
            : item,
        ),
      })),
    updateCardStyle: (nodeId, style) =>
      set((state) => ({
        items: state.items.map((item) =>
          item.graphNodeId === nodeId
            ? { ...item, presentation: { ...item.presentation, style: { ...item.presentation.style, ...style } } }
            : item,
        ),
      })),
    applyPersistedLayout: (nodeId, layout) =>
      set((state) => ({
        items: state.items.map((item) => item.graphNodeId === nodeId
          ? { ...item, presentation: { lane: layout.lane, offsetY: layout.offsetY, width: layout.width,
              height: layout.height, style: layout.style, layoutRevision: layout.layoutRevision } }
          : item),
      })),
  }));
}

function isCameraNearTimeline(items: TimelineItem[], centerYear: number): boolean {
  if (items.length === 0 || !Number.isFinite(centerYear)) return false;

  let minYear = Number.POSITIVE_INFINITY;
  let maxYear = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    minYear = Math.min(minYear, item.startYear);
    maxYear = Math.max(maxYear, item.endYear ?? item.startYear);
  }

  if (!Number.isFinite(minYear) || !Number.isFinite(maxYear)) return false;
  const domainYears = Math.max(maxYear - minYear, 1);
  // The margin preserves a nearby, intentional working focus while avoiding
  // a stale camera from a different historical corpus.
  const marginYears = Math.max(50, domainYears * 0.25);
  return centerYear >= minYear - marginYears && centerYear <= maxYear + marginYears;
}

function fitViewportToItems(
  items: TimelineItem[],
  widthPx: number,
): Pick<TimelineStoreState, "centerYear" | "pixelsPerYear"> {
  let minYear = Number.POSITIVE_INFINITY;
  let maxYear = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    minYear = Math.min(minYear, item.startYear);
    maxYear = Math.max(maxYear, item.endYear ?? item.startYear);
  }

  if (!Number.isFinite(minYear) || !Number.isFinite(maxYear)) {
    return { centerYear: 1700, pixelsPerYear: 2 };
  }

  const domainYears = Math.max(maxYear - minYear, 1);
  const visibleYears = Math.max(
    MIN_INITIAL_VISIBLE_YEARS,
    domainYears * (1 + DOMAIN_PADDING_RATIO),
  );
  return {
    centerYear: (minYear + maxYear) / 2,
    pixelsPerYear: clampPixelsPerYear(widthPx / visibleYears),
  };
}
