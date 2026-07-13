import { createStore, type StoreApi } from "zustand/vanilla";

import type { ArchetypalLighting, GraphRelationship, TimelineDiagnostic, TimelineLane, TimelineLayoutOverride, TimelineView } from "./contracts";
import { tierForPixelsPerYear, type ScaleTier } from "./scale";
import { projectNodes, type TimelineItem, type TimelinePresentation } from "./projection";
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

export interface TimelineStoreState {
  centerYear: number;
  pixelsPerYear: number;
  widthPx: number;
  items: TimelineItem[];
  relationships: GraphRelationship[];
  lanes: TimelineLane[];
  diagnostics: TimelineDiagnostic[];
  litMap: LitMap;
  selectedNodeId: string | null;
  lightingOperatorId: string | null;
  /** Transient screen-space camera offset for cards above/below the axis. */
  verticalOffset: number;
  manualViewport: boolean;

  viewport: () => TimelineViewport;
  tier: () => ScaleTier;

  setWidth: (px: number) => void;
  hydrate: (view: TimelineView) => void;
  pan: (deltaPx: number) => void;
  panVertical: (deltaPx: number, bounds: TimelineVerticalPanBounds) => void;
  resetVerticalPan: () => void;
  zoom: (factor: number, anchorPx: number) => void;
  setView: (centerYear: number, pixelsPerYear: number) => void;
  setLighting: (lighting: ArchetypalLighting) => void;
  clearLighting: () => void;
  setSelected: (nodeId: string | null) => void;
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
    relationships: [],
    lanes: [],
    diagnostics: [],
    litMap: new Map(),
    selectedNodeId: null,
    lightingOperatorId: null,
    verticalOffset: 0,
    manualViewport: hasRememberedViewport,

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
    hydrate: (view) => {
      const items = projectNodes(view.nodes);
      // A workspace can survive a graph replacement while the shell still
      // remembers its last camera. Keep a deliberate focus inside this
      // timeline's historical domain, but do not reopen a populated timeline
      // at a completely unrelated century with every card off-screen.
      const preserveViewport = get().manualViewport && isCameraNearTimeline(items, get().centerYear);
      set({
        items,
        // Older local terminal bridges may return a timeline payload from
        // before temporal relationships were added. Treat that as a readable
        // no-link timeline rather than blanking the whole lens.
        relationships: view.relationships ?? [],
        lanes: view.lanes,
        diagnostics: view.diagnostics,
        manualViewport: preserveViewport,
        ...(!preserveViewport && items.length > 0
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
