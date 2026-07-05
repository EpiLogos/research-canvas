import { createStore, type StoreApi } from "zustand/vanilla";

import type { ArchetypalLighting, GraphNode } from "./contracts";
import { tierForPixelsPerYear, type ScaleTier } from "./scale";
import { projectNodes, type TimelineItem } from "./projection";
import { buildLitMap, type LitMap } from "./lighting";
import {
  clampPixelsPerYear,
  panByPixels,
  zoomAt,
  type TimelineViewport,
} from "./viewport";

export interface TimelineStoreState {
  centerYear: number;
  pixelsPerYear: number;
  widthPx: number;
  items: TimelineItem[];
  litMap: LitMap;
  selectedNodeId: string | null;
  lightingOperatorId: string | null;
  cursorYear: number | null;
  playing: boolean;

  viewport: () => TimelineViewport;
  tier: () => ScaleTier;

  setWidth: (px: number) => void;
  hydrate: (nodes: GraphNode[]) => void;
  pan: (deltaPx: number) => void;
  zoom: (factor: number, anchorPx: number) => void;
  setView: (centerYear: number, pixelsPerYear: number) => void;
  setLighting: (lighting: ArchetypalLighting) => void;
  clearLighting: () => void;
  setSelected: (nodeId: string | null) => void;
  setCursorYear: (year: number | null) => void;
  setPlaying: (playing: boolean) => void;
}

interface CreateTimelineStoreOptions {
  initialCenterYear?: number;
  initialPixelsPerYear?: number;
}

export function createTimelineStore(
  options: CreateTimelineStoreOptions = {},
): StoreApi<TimelineStoreState> {
  return createStore<TimelineStoreState>((set, get) => ({
    centerYear: options.initialCenterYear ?? 1700,
    pixelsPerYear: clampPixelsPerYear(options.initialPixelsPerYear ?? 2),
    widthPx: 1000,
    items: [],
    litMap: new Map(),
    selectedNodeId: null,
    lightingOperatorId: null,
    cursorYear: null,
    playing: false,

    viewport: () => {
      const s = get();
      return {
        centerYear: s.centerYear,
        pixelsPerYear: s.pixelsPerYear,
        widthPx: s.widthPx,
      };
    },
    tier: () => tierForPixelsPerYear(get().pixelsPerYear),

    setWidth: (px) => set({ widthPx: px }),
    hydrate: (nodes) => set({ items: projectNodes(nodes) }),
    pan: (deltaPx) => {
      const next = panByPixels(get().viewport(), deltaPx);
      set({ centerYear: next.centerYear });
    },
    zoom: (factor, anchorPx) => {
      const next = zoomAt(get().viewport(), factor, anchorPx);
      set({ centerYear: next.centerYear, pixelsPerYear: next.pixelsPerYear });
    },
    setView: (centerYear, pixelsPerYear) =>
      set({ centerYear, pixelsPerYear: clampPixelsPerYear(pixelsPerYear) }),
    setLighting: (lighting) =>
      set({
        litMap: buildLitMap(lighting),
        lightingOperatorId: lighting.operator.graphNodeId,
      }),
    clearLighting: () => set({ litMap: new Map(), lightingOperatorId: null }),
    setSelected: (nodeId) => set({ selectedNodeId: nodeId }),
    setCursorYear: (year) => set({ cursorYear: year }),
    setPlaying: (playing) => set({ playing }),
  }));
}
