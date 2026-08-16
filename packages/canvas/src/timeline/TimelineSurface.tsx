import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type MouseEvent as ReactMouseEvent } from "react";
import type {
  GraphNode,
  TimelineRelationField,
  TimelineRepository,
  TimelineTimeWindow,
  TimelineViewState,
  TimelineWalk,
} from "@research-canvas/desktop-api";
import { TimelineLens as RichTimelineLens, type TimelineDataSource } from "./TimelineLens";

const EMPTY_WALK: TimelineWalk = { earthboundNodes: [], archetypeLayers: [] };
const MIN_PIXELS_PER_YEAR = 0.02;
const MAX_PIXELS_PER_YEAR = 800;
const CONTROL_ZOOM_FACTOR = 1.6;
const SINGLE_CLICK_DELAY_MS = 180;

export interface TimelineSurfaceProps {
  repository: TimelineRepository;
  constellationId: string;
  dataSource: TimelineDataSource;
  initialState: TimelineViewState;
  onViewStateChange?: (state: TimelineViewState) => void;
  onOpenCanvasNode: (graphNodeId: string) => void | Promise<void>;
  onOpenNode: (
    graphNodeId: string,
    timelineNode?: GraphNode,
    relationField?: TimelineRelationField,
  ) => void;
}

/**
 * Surface #2 composition boundary. The existing high-density TimelineLens is
 * retained for direct manipulation, relations, nested working sets and walks;
 * this wrapper supplies the canonical constellation-scoped repository read,
 * persistent camera contract, spectral archetype field, and tab-opening click
 * behaviour required by the redemption-map surface contract.
 */
export function TimelineSurface({
  repository,
  constellationId,
  dataSource,
  initialState,
  onViewStateChange,
  onOpenCanvasNode,
  onOpenNode,
}: TimelineSurfaceProps): JSX.Element {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedNodeIdRef = useRef(initialState.selectedNodeId);
  const viewStateRef = useRef(initialState);
  const pendingControlledViewportRef = useRef<{ centerYear: number; pixelsPerYear: number } | null>(null);
  const clickTimerRef = useRef<number | null>(null);
  const [widthPx, setWidthPx] = useState(1000);
  const [viewState, setViewState] = useState(initialState);
  const [walk, setWalk] = useState<TimelineWalk>(EMPTY_WALK);
  const [lensRevision, setLensRevision] = useState(0);

  const publishState = useCallback((next: TimelineViewState) => {
    const current = viewStateRef.current;
    if (
      current.centerYear === next.centerYear
      && current.pixelsPerYear === next.pixelsPerYear
      && current.selectedNodeId === next.selectedNodeId
    ) {
      return;
    }
    viewStateRef.current = next;
    selectedNodeIdRef.current = next.selectedNodeId;
    setViewState(next);
    onViewStateChange?.(next);
  }, [onViewStateChange]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width && Number.isFinite(width)) setWidthPx(Math.max(1, width));
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
  }, []);

  const timeWindow = useMemo(
    () => timelineWindowForViewport(viewState.centerYear, viewState.pixelsPerYear, widthPx),
    [viewState.centerYear, viewState.pixelsPerYear, widthPx],
  );

  useEffect(() => {
    let cancelled = false;
    void repository.getTimelineWalk(constellationId, timeWindow)
      .then((next) => {
        if (!cancelled) setWalk(next);
      })
      .catch(() => {
        if (!cancelled) setWalk(EMPTY_WALK);
      });
    return () => {
      cancelled = true;
    };
  }, [constellationId, repository, timeWindow.startYear, timeWindow.endYear]);

  const earthboundById = useMemo(
    () => new Map(walk.earthboundNodes.map((node) => [node.graphNodeId, node] as const)),
    [walk.earthboundNodes],
  );

  // The rich timeline remains the renderer, but card-visible canonical fields
  // come from the repository contract. This keeps the card projection honest:
  // if the canonical walk resolves a Place or colour tag, the rendered card
  // carries that exact value rather than independently reconstructing it.
  const surfaceDataSource = useMemo<TimelineDataSource>(() => ({
    ...dataSource,
    async loadTimelineView(range, filters) {
      const view = await dataSource.loadTimelineView(range, filters);
      return {
        ...view,
        nodes: view.nodes.map((record) => {
          const canonical = earthboundById.get(record.node.graphNodeId);
          if (!canonical) return record;
          return {
            ...record,
            node: {
              ...record.node,
              timelinePlaceName: canonical.placeName,
              timelineColorTag: canonical.colorTag,
            } as GraphNode,
          };
        }),
      };
    },
  }), [dataSource, earthboundById]);

  const setControlledViewport = useCallback((centerYear: number, pixelsPerYear: number) => {
    const target = {
      centerYear,
      pixelsPerYear: clampPixelsPerYear(pixelsPerYear),
    };
    // The old rich-lens instance can publish its previous viewport while React
    // is replacing it for an explicit shell control (zoom/fit). Remember the
    // requested target first so that stale settlement cannot undo the user's
    // command. The replacement lens echoes its target after hydration, at which
    // point direct manipulation becomes authoritative again.
    pendingControlledViewportRef.current = target;
    publishState({
      ...target,
      selectedNodeId: selectedNodeIdRef.current,
    });
    setLensRevision((revision) => revision + 1);
  }, [publishState]);

  const handleLensViewportChange = useCallback((viewport: { centerYear: number; pixelsPerYear: number }) => {
    const pending = pendingControlledViewportRef.current;
    if (pending) {
      if (sameViewport(viewport, pending)) {
        pendingControlledViewportRef.current = null;
      } else {
        return;
      }
    }
    publishState({
      ...viewport,
      selectedNodeId: selectedNodeIdRef.current,
    });
  }, [publishState]);

  const fit = useCallback(() => {
    // An empty in-memory walk can mean either a genuinely empty constellation
    // or simply that the canonical repository read has not resolved yet. Fit
    // must never collapse a still-loading global view to an arbitrary year-0
    // window; the control remains disabled until there is data to fit.
    if (walk.earthboundNodes.length === 0) return;
    const years = walk.earthboundNodes.map((node) => node.x).filter(Number.isFinite);
    if (years.length === 0) return;
    const min = Math.min(...years);
    const max = Math.max(...years);
    const span = Math.max(40, max - min);
    const paddedSpan = span * 1.18;
    setControlledViewport((min + max) / 2, Math.max(1, widthPx) / paddedSpan);
  }, [setControlledViewport, walk.earthboundNodes, widthPx]);

  const handleSurfaceClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const nodeElement = target.closest<HTMLElement>(".timeline-node[data-testid^='timeline-node-']");
    if (!nodeElement) return;
    // Default click follows the T11 contract and opens the node on Canvas.
    // Shift-click deliberately stays on Timeline so the rich working-set
    // exploration remains available as a real user affordance rather than a
    // test-only synthetic event path.
    if (event.shiftKey) return;
    const testId = nodeElement.getAttribute("data-testid");
    const graphNodeId = testId?.slice("timeline-node-".length) ?? "";
    if (!graphNodeId) return;

    if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      const next = { ...viewStateRef.current, selectedNodeId: graphNodeId };
      publishState(next);
      void onOpenCanvasNode(graphNodeId);
    }, SINGLE_CLICK_DELAY_MS);
  }, [onOpenCanvasNode, publishState]);

  const cancelPendingSingleClick = useCallback(() => {
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
  }, []);

  return (
    <div
      ref={rootRef}
      className="timeline-surface"
      data-testid="timeline-surface"
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
      onClick={handleSurfaceClick}
      onDoubleClick={cancelPendingSingleClick}
    >
      <div
        className="timeline-surface-controls"
        aria-label="Timeline navigation controls"
        style={{ position: "absolute", top: 8, right: 12, zIndex: 6, display: "flex", gap: 6 }}
      >
        <button
          type="button"
          data-testid="timeline-zoom-out"
          aria-label="Zoom timeline out"
          onClick={(event) => {
            event.stopPropagation();
            setControlledViewport(viewState.centerYear, viewState.pixelsPerYear / CONTROL_ZOOM_FACTOR);
          }}
        >−</button>
        <button
          type="button"
          data-testid="timeline-fit"
          aria-label="Fit timeline to active constellation"
          disabled={walk.earthboundNodes.length === 0}
          onClick={(event) => {
            event.stopPropagation();
            fit();
          }}
        >Fit</button>
        <button
          type="button"
          data-testid="timeline-zoom-in"
          aria-label="Zoom timeline in"
          onClick={(event) => {
            event.stopPropagation();
            setControlledViewport(viewState.centerYear, viewState.pixelsPerYear * CONTROL_ZOOM_FACTOR);
          }}
        >+</button>
      </div>

      <div
        className="timeline-archetype-field"
        data-testid="timeline-archetype-field"
        aria-label="Archetypal background field"
        style={{ position: "absolute", inset: "54px 0 0 0", zIndex: 2, pointerEvents: "none" }}
      >
        {walk.archetypeLayers.map((layer, layerIndex) => (
          <div
            key={layer.archetypeId}
            className="timeline-archetype-layer"
            data-testid={`timeline-archetype-layer-${layer.archetypeId}`}
            aria-label={layer.title}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: `${18 + layerIndex * 24}px`,
              height: 18,
              opacity: Math.min(0.42, 0.12 + layer.expressions.length * 0.035),
            }}
          >
            <span style={{ position: "absolute", left: 8, fontSize: 10 }}>{layer.title}</span>
            {layer.expressions.map((expression, expressionIndex) => {
              const startYear = yearFromTemporal(expression.start) ?? timeWindow.startYear;
              const endYear = yearFromTemporal(expression.end) ?? startYear;
              const left = yearPercent(startYear, timeWindow);
              const right = yearPercent(endYear, timeWindow);
              return (
                <span
                  key={`${expression.start}:${expression.end ?? "open"}:${expressionIndex}`}
                  className="timeline-archetype-expression"
                  data-testid={`timeline-archetype-expression-${layer.archetypeId}-${expressionIndex}`}
                  data-color-tag={expression.colorTag}
                  data-start-year={startYear}
                  data-end-year={endYear}
                  title={`${expression.placeName} · ${expression.start}${expression.end ? `–${expression.end}` : ""}`}
                  style={{
                    position: "absolute",
                    left: `${Math.min(left, right)}%`,
                    width: `${Math.max(0.8, Math.abs(right - left))}%`,
                    top: 0,
                    bottom: 0,
                    borderRadius: 999,
                    background: "color-mix(in srgb, currentColor 28%, transparent)",
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>

      <div
        className="timeline-earthbound-track"
        data-testid="timeline-earthbound-track"
        style={{ position: "absolute", inset: 0, zIndex: 1 }}
      >
        <RichTimelineLens
          key={lensRevision}
          dataSource={surfaceDataSource}
          onOpenNode={onOpenNode}
          initialViewport={{
            centerYear: viewState.centerYear,
            pixelsPerYear: viewState.pixelsPerYear,
          }}
          onViewportChange={handleLensViewportChange}
        />
      </div>
    </div>
  );
}

function timelineWindowForViewport(
  centerYear: number,
  pixelsPerYear: number,
  widthPx: number,
): TimelineTimeWindow {
  const visibleYears = Math.max(1, widthPx) / clampPixelsPerYear(pixelsPerYear);
  const paddedYears = Math.max(40, visibleYears * 1.5);
  return {
    startYear: Math.floor(centerYear - paddedYears / 2),
    endYear: Math.ceil(centerYear + paddedYears / 2),
  };
}

function yearPercent(year: number, window: TimelineTimeWindow): number {
  const span = Math.max(1, window.endYear - window.startYear);
  return Math.max(0, Math.min(100, ((year - window.startYear) / span) * 100));
}

function yearFromTemporal(value: string | null): number | null {
  if (!value) return null;
  const match = /^(-?\d{1,6})(?:-|$)/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isFinite(year) ? year : null;
}

function clampPixelsPerYear(value: number): number {
  return Math.min(MAX_PIXELS_PER_YEAR, Math.max(MIN_PIXELS_PER_YEAR, value));
}

function sameViewport(
  left: { centerYear: number; pixelsPerYear: number },
  right: { centerYear: number; pixelsPerYear: number },
): boolean {
  return left.centerYear === right.centerYear && left.pixelsPerYear === right.pixelsPerYear;
}
