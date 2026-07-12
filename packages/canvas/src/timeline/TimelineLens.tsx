import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import { useStore } from "zustand";

import type { ArchetypalLighting, GraphNode, LitInstance, TimelineLayoutMutationResult, TimelineView } from "./contracts";
import { createTimelineStore, type TimelineCardGeometryUpdate } from "./timelineStore";
import { placeItems, type TimelinePresentation } from "./projection";
import { generateTicks } from "./ticks";
import { TimelineAxis } from "./TimelineAxis";
import { TimelineNode } from "./TimelineNode";
import { TimelineRelationshipLayer } from "./TimelineRelationshipLayer";
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
  loadTimelineView(): Promise<TimelineView>;
  archetypalLighting(operatorGraphNodeId: string): Promise<ArchetypalLighting>;
  resonancesForInstance(graphNodeId: string): Promise<LitInstance[]>;
  saveTimelineLayout?(input: {
    graphNodeId: string; lane: string; offsetY: number; width: number; height: number;
    style: Record<string, unknown>; expectedRevision: number | null;
  }): Promise<TimelineLayoutMutationResult>;
}

export interface TimelineLensProps {
  dataSource: TimelineDataSource;
  onOpenNode: (graphNodeId: string, node: GraphNode) => void;
  onPlaySequence?: () => void;
  initialViewport?: { centerYear: number; pixelsPerYear: number };
  onViewportChange?: (viewport: { centerYear: number; pixelsPerYear: number }) => void;
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
  initialViewport,
  onViewportChange,
}: TimelineLensProps): JSX.Element {
  const store = useMemo(
    () => createTimelineStore(
      initialViewport
        ? {
            initialCenterYear: initialViewport.centerYear,
            initialPixelsPerYear: initialViewport.pixelsPerYear,
          }
        : {},
    ),
    [],
  );
  const state = useStore(store);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [resonances, setResonances] = useState<LitInstance[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const saveQueues = useRef(new Map<string, Promise<void>>());
  const saveVersions = useRef(new Map<string, number>());
  const knownRevisions = useRef(new Map<string, number>());
  const dataSourceEpoch = useRef(0);
  const [visibleCategories, setVisibleCategories] = useState<Record<TimelineCategory, boolean>>(() =>
    Object.fromEntries(TIMELINE_CATEGORIES.map((category) => [category.id, true])) as Record<TimelineCategory, boolean>,
  );

  // Load timeline nodes once on mount.
  useEffect(() => {
    let cancelled = false;
    dataSourceEpoch.current += 1;
    saveQueues.current.clear();
    saveVersions.current.clear();
    knownRevisions.current.clear();
    setSaveErrors({});
    setLoaded(false);
    setLoadError(null);
    void dataSource.loadTimelineView()
      .then((view) => {
        if (!cancelled) store.getState().hydrate(view);
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
  useEffect(() => {
    onViewportChange?.({
      centerYear: viewport.centerYear,
      pixelsPerYear: viewport.pixelsPerYear,
    });
  }, [onViewportChange, viewport.centerYear, viewport.pixelsPerYear]);
  const tier = state.tier();
  // Preserve direct manipulation at the normal working scale.  Only the
  // genuinely panoramic millennium view collapses nodes to markers; century
  // view remains a compact, readable card so a user never loses the controls
  // simply by opening the timeline.
  const lod = tier === "millennium"
    ? "marker"
    : tier === "century"
      ? "label"
      : "detail";
  const allPlaced = placeItems(state.items, viewport, state.lanes);
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
    if (!dataSource.saveTimelineLayout) return;
    store.getState().updateCardSize(graphNodeId, size);
  };

  const handleColorTag = (graphNodeId: string, style: Partial<TimelinePresentation["style"]>) => {
    if (!dataSource.saveTimelineLayout) return;
    store.getState().updateCardStyle(graphNodeId, style);
    commitTimelineLayout(graphNodeId);
  };

  const commitTimelineLayout = (graphNodeId: string) => {
    if (!dataSource.saveTimelineLayout) return;
    const item = store.getState().items.find((candidate) => candidate.graphNodeId === graphNodeId);
    if (!item) return;
    const snapshot = { ...item.presentation, style: { ...item.presentation.style } };
    const epoch = dataSourceEpoch.current;
    const version = (saveVersions.current.get(graphNodeId) ?? 0) + 1;
    saveVersions.current.set(graphNodeId, version);
    const prior = saveQueues.current.get(graphNodeId) ?? Promise.resolve();
    const next = prior.then(async () => {
      if (dataSourceEpoch.current !== epoch) return;
      const expectedRevision = knownRevisions.current.get(graphNodeId) ?? snapshot.layoutRevision;
      try {
        const result = await dataSource.saveTimelineLayout!({
          graphNodeId, lane: snapshot.lane ?? "events", offsetY: snapshot.offsetY,
          width: snapshot.width, height: snapshot.height, style: snapshot.style, expectedRevision,
        });
        if (dataSourceEpoch.current !== epoch) return;
        if (result.status === "conflict") {
          if (result.layout) knownRevisions.current.set(graphNodeId, result.layout.layoutRevision);
          setSaveErrors((current) => ({ ...current, [graphNodeId]: `Pending timeline edit: ${result.reason}` }));
          return;
        }
        knownRevisions.current.set(graphNodeId, result.layout.layoutRevision);
        if (saveVersions.current.get(graphNodeId) === version) {
          store.getState().applyPersistedLayout(graphNodeId, result.layout);
        }
        setSaveErrors((current) => { const copy = { ...current }; delete copy[graphNodeId]; return copy; });
      } catch (error) {
        if (dataSourceEpoch.current !== epoch) return;
        setSaveErrors((current) => ({ ...current, [graphNodeId]: `Pending timeline edit: ${error instanceof Error ? error.message : String(error)}` }));
      }
    });
    saveQueues.current.set(graphNodeId, next);
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
        {Object.entries(saveErrors).map(([nodeId, message]) => (
          <div key={nodeId} role="alert" data-testid={`timeline-save-error-${nodeId}`}>
            {message} <button type="button" onClick={() => commitTimelineLayout(nodeId)}>Retry</button>
          </div>
        ))}
        {state.diagnostics.length > 0 && (
          <aside className="timeline-diagnostics" data-testid="timeline-diagnostics" aria-label="Timeline diagnostics">
            <strong>{state.diagnostics.length} timeline {state.diagnostics.length === 1 ? "issue" : "issues"}</strong>
            <ul>
              {state.diagnostics.map((diagnostic) => (
                <li key={`${diagnostic.graphNodeId}:${diagnostic.code}`}>
                  {diagnostic.graphNodeId}: {diagnostic.message}
                </li>
              ))}
            </ul>
          </aside>
        )}
        {showEmptyState && (
          <div className="timeline-load-state" data-testid="timeline-empty-state">
            No temporal nodes loaded
          </div>
        )}
        <TimelineRelationshipLayer
          relationships={state.relationships}
          placed={placed}
          viewportWidth={viewport.widthPx}
          lod={lod}
        />
        <div className="timeline-nodes">
          {placed.map((p) => {
            const lit = lighting.get(p.item.graphNodeId) ?? null;
            const dimmed = lightingActive && lit === null;
            return (
              <TimelineNode
                key={p.item.graphNodeId}
                placed={p}
                lod={lod}
                lit={lit}
                selected={state.selectedNodeId === p.item.graphNodeId}
                dimmed={dimmed}
                filtered={false}
                viewportWidth={viewport.widthPx}
                onSelect={handleSelect}
                onOpen={onOpenNode}
                onResize={handleResizeNode}
                onCommit={commitTimelineLayout}
                onColorTag={handleColorTag}
                readOnly={!dataSource.saveTimelineLayout}
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
