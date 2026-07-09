import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import { useStore } from "zustand";

import type { ArchetypalLighting, LitInstance, NodeLayout, TimelineNodeRecord } from "./contracts";
import { createTimelineStore, type TimelineCardGeometryUpdate } from "./timelineStore";
import { placeItems } from "./projection";
import { generateTicks } from "./ticks";
import { TimelineAxis } from "./TimelineAxis";
import { TimelineNode } from "./TimelineNode";
import { ResonancePopover } from "./ResonancePopover";
import { TimelineTransport } from "./TimelineTransport";
import { pixelToYear, yearToPixel } from "./viewport";
import { deriveTimelineCategory, TIMELINE_CATEGORIES, type TimelineCategory } from "./categories";

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export interface TimelineDataSource {
  loadTimelineNodes(): Promise<TimelineNodeRecord[]>;
  archetypalLighting(operatorGraphNodeId: string): Promise<ArchetypalLighting>;
  resonancesForInstance(graphNodeId: string): Promise<LitInstance[]>;
}

export interface TimelineLensProps {
  dataSource: TimelineDataSource;
  onOpenNode: (graphNodeId: string) => void;
  onPlaySequence?: () => void;
  onResizeNode?: (graphNodeId: string, size: TimelineCardGeometryUpdate) => void;
  onUpdateTimelineCard?: (
    graphNodeId: string,
    timelineCard: { offsetY: number; width?: number; height?: number },
  ) => void;
  onUpdateNodeStyle?: (graphNodeId: string, style: Partial<NodeLayout["style"]>) => void;
}

const AXIS_HEIGHT = 48;
// Wheel-zoom sensitivity: factor per pixel of deltaY, exponential so a large
// wheel/trackpad delta produces a proportionally larger zoom change. Negative
// deltaY (scroll up / pinch out) zooms in.
const WHEEL_ZOOM_BASE = 1.003;

export function TimelineLens({
  dataSource,
  onOpenNode,
  onPlaySequence,
  onResizeNode,
  onUpdateTimelineCard,
  onUpdateNodeStyle,
}: TimelineLensProps): JSX.Element {
  const store = useMemo(() => createTimelineStore(), []);
  const state = useStore(store);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [resonances, setResonances] = useState<LitInstance[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [visibleCategories, setVisibleCategories] = useState<Record<TimelineCategory, boolean>>(() =>
    Object.fromEntries(TIMELINE_CATEGORIES.map((category) => [category.id, true])) as Record<TimelineCategory, boolean>,
  );

  // Load timeline nodes once on mount.
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setLoadError(null);
    void dataSource.loadTimelineNodes()
      .then((nodes) => {
        if (!cancelled) store.getState().hydrate(nodes);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [dataSource, store]);

  // Track width measurement (ResizeObserver is mocked in tests; fall back to a
  // sensible default so layout math runs even before the observer fires).
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      store.getState().setWidth(w > 0 ? w : 1000);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [store]);

  const viewport = state.viewport();
  const tier = state.tier();
  const allPlaced = placeItems(state.items, viewport);
  const placed = allPlaced.filter((p) => visibleCategories[deriveTimelineCategory(p.item.node)]);
  const ticks = generateTicks(viewport, tier);
  const lighting = state.litMap;
  const lightingActive = state.lightingOperatorId !== null;
  const showEmptyState = loaded && !loadError && placed.length === 0;
  const activeCategories = TIMELINE_CATEGORIES.filter((category) =>
    state.items.some((item) => deriveTimelineCategory(item.node) === category.id),
  );

  const minYear = pixelToYear(viewport, 0);
  const maxYear = pixelToYear(viewport, viewport.widthPx);
  const { cursorYear, playing } = state;
  const fraction = cursorYear == null ? 0 : clamp01((cursorYear - minYear) / (maxYear - minYear));
  const cursorLabel = cursorYear == null ? "—" : String(Math.round(cursorYear));

  const handleScrub = (f: number) => {
    store.getState().setCursorYear(minYear + f * (maxYear - minYear));
  };

  const handleTogglePlay = () => {
    store.getState().setPlaying(!playing);
  };

  // Play animation: advance the cursor across the visible range over ~8s.
  useEffect(() => {
    if (!playing) return;
    if (maxYear === minYear) {
      store.getState().setPlaying(false);
      return;
    }
    if (store.getState().cursorYear == null) {
      store.getState().setCursorYear(minYear);
    }
    const yearsPerSecond = (maxYear - minYear) / 8;
    let rafId: number;
    let lastTs: number | null = null;
    const step = (ts: number) => {
      if (lastTs == null) lastTs = ts;
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;
      const current = store.getState().cursorYear ?? minYear;
      const next = current + yearsPerSecond * dt;
      if (next >= maxYear) {
        store.getState().setCursorYear(maxYear);
        store.getState().setPlaying(false);
        return;
      }
      store.getState().setCursorYear(next);
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [playing, minYear, maxYear, store]);

  const handleSelect = (graphNodeId: string) => {
    store.getState().setSelected(graphNodeId);
    void dataSource.resonancesForInstance(graphNodeId).then(setResonances);
  };

  const handleLightOperator = (operatorGraphNodeId: string) => {
    void dataSource.archetypalLighting(operatorGraphNodeId).then((result) => {
      store.getState().setLighting(result);
    });
  };

  const handleResizeNode = (graphNodeId: string, size: TimelineCardGeometryUpdate) => {
    store.getState().updateCardSize(graphNodeId, size);
    onResizeNode?.(graphNodeId, size);
    onUpdateTimelineCard?.(graphNodeId, {
      offsetY: size.positionY ?? 0,
      width: size.width,
      height: size.height,
    });
  };

  const handleColorTag = (graphNodeId: string, style: Partial<NodeLayout["style"]>) => {
    store.getState().updateCardStyle(graphNodeId, style);
    onUpdateNodeStyle?.(graphNodeId, style);
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = trackRef.current?.getBoundingClientRect();
    const anchorPx = rect ? event.clientX - rect.left : viewport.widthPx / 2;
    const factor = Math.pow(WHEEL_ZOOM_BASE, -event.deltaY);
    store.getState().zoom(factor, anchorPx);
  };

  // Drag-to-pan.
  const dragState = useRef<{ lastX: number } | null>(null);
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragState.current = { lastX: event.clientX };
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    const deltaPx = event.clientX - dragState.current.lastX;
    dragState.current.lastX = event.clientX;
    store.getState().pan(deltaPx);
  };
  const handlePointerUp = () => {
    dragState.current = null;
  };

  return (
    <div className="timeline-lens" data-testid="timeline-lens">
      <div className="timeline-toolbar" data-testid="timeline-toolbar">
        <span className="timeline-tier" data-testid="timeline-tier">{tier}</span>
        {activeCategories.length > 0 && (
          <div className="timeline-filters" aria-label="Timeline card filters">
            {activeCategories.map((category) => {
              const visible = visibleCategories[category.id];
              return (
                <button
                  key={category.id}
                  type="button"
                  className="timeline-filter"
                  data-active={visible ? "true" : "false"}
                  aria-label={`${visible ? "Hide" : "Show"} ${category.id.replaceAll("-", " ")}`}
                  onClick={() =>
                    setVisibleCategories((current) => ({
                      ...current,
                      [category.id]: !current[category.id],
                    }))
                  }
                >
                  <span className="timeline-filter__swatch" style={{ backgroundColor: category.color }} />
                  <span>{category.label}</span>
                </button>
              );
            })}
          </div>
        )}
        {lightingActive && (
          <button
            type="button"
            data-testid="timeline-clear-lighting"
            onClick={() => store.getState().clearLighting()}
          >
            Clear lighting
          </button>
        )}
      </div>
      <div
        className="timeline-track"
        data-testid="timeline-track"
        ref={trackRef}
        style={{ position: "relative", overflow: "hidden" }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <TimelineAxis ticks={ticks} height={AXIS_HEIGHT} />
        {loadError && (
          <div className="timeline-load-state timeline-load-state--error" data-testid="timeline-load-error">
            Timeline data unavailable: {loadError}
          </div>
        )}
        {showEmptyState && (
          <div className="timeline-load-state" data-testid="timeline-empty-state">
            No temporal nodes loaded
          </div>
        )}
        <div className="timeline-nodes">
          {placed.map((p) => {
            const lit = lighting.get(p.item.graphNodeId) ?? null;
            const dimmed = lightingActive && lit === null;
            return (
              <TimelineNode
                key={p.item.graphNodeId}
                placed={p}
                lit={lit}
                selected={state.selectedNodeId === p.item.graphNodeId}
                dimmed={dimmed}
                filtered={false}
                viewportWidth={viewport.widthPx}
                onSelect={handleSelect}
                onOpen={onOpenNode}
                onResize={handleResizeNode}
                onColorTag={handleColorTag}
              />
            );
          })}
        </div>
        {cursorYear != null && (
          <div className="timeline-cursor" style={{ left: `${yearToPixel(viewport, cursorYear)}px` }} />
        )}
      </div>
      {state.selectedNodeId !== null && (
        <ResonancePopover
          resonances={resonances}
          onLightOperator={handleLightOperator}
        />
      )}
      <TimelineTransport
        playing={playing}
        onTogglePlay={handleTogglePlay}
        fraction={fraction}
        onScrub={handleScrub}
        label={cursorLabel}
        onPlaySequence={onPlaySequence}
      />
    </div>
  );
}
