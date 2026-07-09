import { createStore, type StoreApi } from "zustand/vanilla";

import type { ArchetypalLighting, NodeLayout, TimelineNodeRecord } from "./contracts";
import { tierForPixelsPerYear, type ScaleTier } from "./scale";
import { projectNodes, type TimelineItem } from "./projection";
import { buildLitMap, type LitMap } from "./lighting";
import {
  clampPixelsPerYear,
  panByPixels,
  zoomAt,
  type TimelineViewport,
} from "./viewport";

const MIN_INITIAL_VISIBLE_YEARS = 160;
const DOMAIN_PADDING_RATIO = 0.18;

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
  manualViewport: boolean;

  viewport: () => TimelineViewport;
  tier: () => ScaleTier;

  setWidth: (px: number) => void;
  hydrate: (records: TimelineNodeRecord[]) => void;
  pan: (deltaPx: number) => void;
  zoom: (factor: number, anchorPx: number) => void;
  setView: (centerYear: number, pixelsPerYear: number) => void;
  setLighting: (lighting: ArchetypalLighting) => void;
  clearLighting: () => void;
  setSelected: (nodeId: string | null) => void;
  setCursorYear: (year: number | null) => void;
  setPlaying: (playing: boolean) => void;
  updateCardSize: (nodeId: string, size: TimelineCardGeometryUpdate) => void;
  updateCardStyle: (nodeId: string, style: Partial<NodeLayout["style"]>) => void;
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
    manualViewport: false,

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
    hydrate: (records) => {
      const items = projectNodes(records);
      set({
        items,
        manualViewport: false,
        ...(items.length > 0 ? fitViewportToItems(items, get().widthPx) : {}),
      });
    },
    pan: (deltaPx) => {
      const next = panByPixels(get().viewport(), deltaPx);
      set({ centerYear: next.centerYear, manualViewport: true });
    },
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
    setCursorYear: (year) => set({ cursorYear: year }),
    setPlaying: (playing) => set({ playing }),
    updateCardSize: (nodeId, size) =>
      set((state) => ({
        items: state.items.map((item) =>
          item.graphNodeId === nodeId
            ? {
                ...item,
                layout: {
                  ...item.layout,
                  width: size.width,
                  height: size.height,
                  style: {
                    ...item.layout.style,
                    __timelineCard: {
                      offsetY: size.positionY ?? item.layout.style.__timelineCard?.offsetY ?? 0,
                      width: size.width,
                      height: size.height,
                    },
                  },
                },
              }
            : item,
        ),
      })),
    updateCardStyle: (nodeId, style) =>
      set((state) => ({
        items: state.items.map((item) =>
          item.graphNodeId === nodeId
            ? { ...item, layout: { ...item.layout, style: { ...item.layout.style, ...style } } }
            : item,
        ),
      })),
  }));
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
