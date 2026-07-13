import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { deriveTimelineCategory, TIMELINE_CATEGORIES, type TimelineCategory } from "./categories";

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
  initialViewport?: { centerYear: number; pixelsPerYear: number };
  onViewportChange?: (viewport: { centerYear: number; pixelsPerYear: number }) => void;
}

const AXIS_HEIGHT = 48;
// Wheel-zoom sensitivity: factor per pixel of deltaY, exponential so a large
// wheel/trackpad delta produces a proportionally larger zoom change. Negative
// deltaY (scroll up / pinch out) zooms in.
const WHEEL_ZOOM_BASE = 1.003;
const TIMELINE_NUDGE_PX = 36;
const TIMELINE_INITIAL_PAN_SPEED_PX_PER_SECOND = 220;
const TIMELINE_PAN_ACCELERATION_PX_PER_SECOND_SQUARED = 980;
const TIMELINE_MAX_PAN_SPEED_PX_PER_SECOND = 2_400;

type TimelineNavigationDirection = "earlier" | "later";

export function TimelineLens({
  dataSource,
  onOpenNode,
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
  const navigationRef = useRef<{
    direction: TimelineNavigationDirection;
    frameId: number;
    startedAt: number | null;
    lastFrameAt: number | null;
  } | null>(null);

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
  const dragState = useRef<{ lastX: number; lastY: number } | null>(null);
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragState.current = { lastX: event.clientX, lastY: event.clientY };
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  };
  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    const deltaPx = event.clientX - dragState.current.lastX;
    const deltaY = event.clientY - dragState.current.lastY;
    dragState.current.lastX = event.clientX;
    dragState.current.lastY = event.clientY;
    if (deltaPx !== 0) store.getState().pan(deltaPx);
    if (deltaY !== 0) store.getState().panVertical(deltaY, verticalPanBounds(placed, trackRef.current?.clientHeight ?? 480));
  };
  const handlePointerUp = () => {
    dragState.current = null;
  };

  const stopTimelineNavigation = useCallback(() => {
    const navigation = navigationRef.current;
    if (navigation) window.cancelAnimationFrame(navigation.frameId);
    navigationRef.current = null;
  }, []);

  const startTimelineNavigation = useCallback((direction: TimelineNavigationDirection) => {
    stopTimelineNavigation();
    const directionMultiplier = direction === "earlier" ? 1 : -1;
    // A short tap still gives a discernible nudge. Holding continues from that
    // movement and quickly ramps from a walk to a fast scrub.
    store.getState().pan(directionMultiplier * TIMELINE_NUDGE_PX);
    const step = (timestamp: number) => {
      const navigation = navigationRef.current;
      if (!navigation || navigation.direction !== direction) return;
      if (navigation.startedAt === null || navigation.lastFrameAt === null) {
        navigation.startedAt = timestamp;
        navigation.lastFrameAt = timestamp;
      } else {
        const elapsedSeconds = (timestamp - navigation.startedAt) / 1_000;
        const frameSeconds = Math.min((timestamp - navigation.lastFrameAt) / 1_000, 0.05);
        const speed = Math.min(
          TIMELINE_MAX_PAN_SPEED_PX_PER_SECOND,
          TIMELINE_INITIAL_PAN_SPEED_PX_PER_SECOND
            + elapsedSeconds * TIMELINE_PAN_ACCELERATION_PX_PER_SECOND_SQUARED,
        );
        store.getState().pan(directionMultiplier * speed * frameSeconds);
        navigation.lastFrameAt = timestamp;
      }
      navigation.frameId = window.requestAnimationFrame(step);
    };
    navigationRef.current = {
      direction,
      frameId: window.requestAnimationFrame(step),
      startedAt: null,
      lastFrameAt: null,
    };
  }, [stopTimelineNavigation, store]);

  const nudgeTimelineNavigation = useCallback((direction: TimelineNavigationDirection) => {
    const directionMultiplier = direction === "earlier" ? 1 : -1;
    store.getState().pan(directionMultiplier * TIMELINE_NUDGE_PX);
  }, [store]);

  useEffect(() => stopTimelineNavigation, [stopTimelineNavigation]);

  return (
    <div className="timeline-lens" data-testid="timeline-lens">
      <div className="timeline-toolbar" data-testid="timeline-toolbar">
        <div className="timeline-navigation" role="group" aria-label="Timeline navigation">
          <TimelineNavigationButton
            direction="earlier"
            onStart={startTimelineNavigation}
            onStop={stopTimelineNavigation}
            onNudge={nudgeTimelineNavigation}
          />
          <TimelineNavigationButton
            direction="later"
            onStart={startTimelineNavigation}
            onStop={stopTimelineNavigation}
            onNudge={nudgeTimelineNavigation}
          />
        </div>
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
        {state.verticalOffset !== 0 && (
          <button
            type="button"
            data-testid="timeline-reset-vertical"
            onClick={() => store.getState().resetVerticalPan()}
          >
            Centre timeline
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
        <div
          className="timeline-scene"
          data-testid="timeline-scene"
          style={{ transform: `translateY(${state.verticalOffset}px)` }}
        >
          <TimelineAxis ticks={ticks} height={AXIS_HEIGHT} />
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
        </div>
      </div>
      {state.selectedNodeId !== null && (
        <ResonancePopover
          resonances={resonances}
          onLightOperator={handleLightOperator}
        />
      )}
    </div>
  );
}

function TimelineNavigationButton({
  direction,
  onStart,
  onStop,
  onNudge,
}: {
  direction: TimelineNavigationDirection;
  onStart: (direction: TimelineNavigationDirection) => void;
  onStop: () => void;
  onNudge: (direction: TimelineNavigationDirection) => void;
}): JSX.Element {
  const label = direction === "earlier" ? "Move timeline earlier" : "Move timeline later";
  return (
    <button
      type="button"
      className="timeline-navigation__button"
      aria-label={label}
      title="Hold to move faster"
      onPointerDown={(event) => {
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        onStart(direction);
      }}
      onPointerUp={onStop}
      onPointerCancel={onStop}
      onLostPointerCapture={onStop}
      onClick={(event) => {
        // Keyboard activation does not produce a pointer-down event. It still
        // gets a single accessible nudge, whereas mouse/touch uses the hold
        // loop above.
        if (event.detail === 0) onNudge(direction);
      }}
    >
      {direction === "earlier" ? "←" : "→"}
    </button>
  );
}

function verticalPanBounds(placed: ReturnType<typeof placeItems>, trackHeight: number) {
  const height = Math.max(trackHeight, 1);
  const halfHeight = height / 2;
  const margin = 24;
  const exploratoryPan = 96;
  let highestCardTop = 0;
  let lowestCardBottom = 0;

  for (const position of placed) {
    const laneOffset = 68 + position.laneIndex * 78;
    const cardHeight = Math.min(260, Math.max(72, position.item.presentation.height));
    const offsetY = position.item.presentation.offsetY;
    const top = position.laneSide === "above"
      ? -laneOffset - cardHeight + offsetY
      : laneOffset + offsetY;
    const bottom = top + cardHeight;
    highestCardTop = Math.min(highestCardTop, top);
    lowestCardBottom = Math.max(lowestCardBottom, bottom);
  }

  return {
    min: Math.min(-exploratoryPan, height - margin - (halfHeight + lowestCardBottom)),
    max: Math.max(exploratoryPan, margin - (halfHeight + highestCardTop)),
  };
}
