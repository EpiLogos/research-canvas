import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import { useStore } from "zustand";

import type { ArchetypalLighting, ExpandedTimelineNode, GraphNode, LitInstance, TimelineFilters, TimelineLayoutMutationResult, TimelineRelationField as TimelineRelationFieldData, TimelineView, TimelineYearRange } from "./contracts";
import { createTimelineStore, type TimelineCardGeometryUpdate } from "./timelineStore";
import { DEFAULT_TIMELINE_CARD_WIDTH_PX, FALLBACK_TIMELINE_LANE_ID, placeItems, type PlacedItem, type TimelinePresentation } from "./projection";
import { generateTicks } from "./ticks";
import { TimelineAxis } from "./TimelineAxis";
import { TimelineNode } from "./TimelineNode";
import { TimelineRelationshipLayer } from "./TimelineRelationshipLayer";
import { TimelineRelationField } from "./TimelineRelationField";
import { TimelineWalk } from "./TimelineWalk";
import { TimelineWorkingSet } from "./TimelineWorkingSet";
import { deriveTimelineCategory, TIMELINE_CATEGORIES, type TimelineCategory } from "./categories";
import { assembleTimelineWalk } from "./walk";

export interface TimelineDataSource {
  loadTimelineView(range?: TimelineYearRange, filters?: TimelineFilters): Promise<TimelineView>;
  loadNode?(graphNodeId: string): Promise<GraphNode>;
  archetypalLighting(operatorGraphNodeId: string): Promise<ArchetypalLighting>;
  resonancesForInstance(graphNodeId: string): Promise<LitInstance[]>;
  relationFieldForEvent?(graphNodeId: string): Promise<TimelineRelationFieldData>;
  /** Lazy relational expansion (ticket #28): one node's real edges + neighbours
   * loaded on demand. Absent on read-only surfaces that cannot serve it. */
  expandNode?(graphNodeId: string): Promise<ExpandedTimelineNode>;
  saveTimelineLayout?(input: {
    graphNodeId: string; lane: string; offsetY: number; width: number; height: number;
    style: Record<string, unknown>; expectedRevision: number | null;
  }): Promise<TimelineLayoutMutationResult>;
}

export interface TimelineLensProps {
  dataSource: TimelineDataSource;
  onOpenNode: (
    graphNodeId: string,
    node: GraphNode,
    relationField?: TimelineRelationFieldData,
  ) => void;
  initialViewport?: { centerYear: number; pixelsPerYear: number };
  onViewportChange?: (viewport: { centerYear: number; pixelsPerYear: number }) => void;
}

const AXIS_HEIGHT = 48;
// Wheel-zoom sensitivity: factor per pixel of deltaY, exponential so a large
// wheel/trackpad delta produces a proportionally larger zoom change. Negative
// deltaY (scroll up / pinch out) zooms in.
const WHEEL_ZOOM_BASE = 1.003;
const TIMELINE_PAN_ACCELERATION_PX_PER_SECOND_SQUARED = 2_400;
const TIMELINE_MAX_PAN_SPEED_PX_PER_SECOND = 2_400;
const TIMELINE_TAIL_DECELERATION_PX_PER_SECOND_SQUARED = 9_000;
// Mount cards only near the camera. The margin keeps panning continuous while
// capping the number of interactive cards and listeners at deep zoom levels.
const TIMELINE_RENDER_OVERSCAN_PX = 320;
const TIMELINE_LOAD_DEBOUNCE_MS = 120;
const TIMELINE_MIN_QUERY_BUFFER_YEARS = 32;

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
  const [relationField, setRelationField] = useState<TimelineRelationFieldData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const saveQueues = useRef(new Map<string, Promise<void>>());
  const saveVersions = useRef(new Map<string, number>());
  const knownRevisions = useRef(new Map<string, number>());
  const dataSourceEpoch = useRef(0);
  const relationFieldRequestVersion = useRef(0);
  const resonanceRequestVersion = useRef(0);
  const timelineRequestVersion = useRef(0);
  const loadedRange = useRef<TimelineYearRange | null>(null);
  const timelineLoadTimer = useRef<number | null>(null);
  const [visibleCategories, setVisibleCategories] = useState<Record<TimelineCategory, boolean>>(() =>
    Object.fromEntries(TIMELINE_CATEGORIES.map((category) => [category.id, true])) as Record<TimelineCategory, boolean>,
  );
  const [relationTypeFilter, setRelationTypeFilter] = useState<string[] | null>(null);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [knownRelationTypes, setKnownRelationTypes] = useState<string[]>([]);
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [showRelations, setShowRelations] = useState(true);
  const [showArchetypalContext, setShowArchetypalContext] = useState(true);
  const [relationFieldOpen, setRelationFieldOpen] = useState(false);
  const navigationRef = useRef<{
    direction: TimelineNavigationDirection;
    frameId: number;
    lastFrameAt: number | null;
    speedPxPerSecond: number;
    phase: "accelerating" | "coasting";
  } | null>(null);
  const heldNavigationKeys = useRef(new Set<"ArrowLeft" | "ArrowRight">());
  const timelineFilters = useMemo<TimelineFilters | undefined>(() => {
    const filters: TimelineFilters = {};
    if (relationTypeFilter !== null) filters.relationTypes = { include: relationTypeFilter };
    if (tagFilter.length > 0) filters.tags = { include: tagFilter };
    return Object.keys(filters).length > 0 ? filters : undefined;
  }, [relationTypeFilter, tagFilter]);
  const timelineFiltersKey = useMemo(
    () => JSON.stringify(timelineFilters ?? {}),
    [timelineFilters],
  );

  useEffect(() => {
    // Filter option vocabularies belong to the active data source. Do not let
    // a previous workspace's relation types or tags survive a source swap.
    setKnownRelationTypes([]);
    setKnownTags([]);
  }, [dataSource]);

  // Load only the initial camera window. Subsequent camera movement requests
  // another bounded window instead of re-reading the whole temporal corpus.
  useEffect(() => {
    let cancelled = false;
    const requestVersion = timelineRequestVersion.current + 1;
    timelineRequestVersion.current = requestVersion;
    const range = timelineRangeForViewport(store.getState().viewport());
    dataSourceEpoch.current += 1;
    saveQueues.current.clear();
    saveVersions.current.clear();
    knownRevisions.current.clear();
    relationFieldRequestVersion.current += 1;
    resonanceRequestVersion.current += 1;
    setRelationField(null);
    setResonances([]);
    setSaveErrors({});
    setLoaded(false);
    setLoadError(null);
    loadedRange.current = null;
    void dataSource.loadTimelineView(range, timelineFilters)
      .then((view) => {
        if (!cancelled && timelineRequestVersion.current === requestVersion) {
          loadedRange.current = range;
          store.getState().hydrate(view);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled && timelineRequestVersion.current === requestVersion) setLoaded(true);
      });
    return () => {
      cancelled = true;
      if (timelineLoadTimer.current !== null) window.clearTimeout(timelineLoadTimer.current);
    };
  }, [dataSource, store, timelineFilters, timelineFiltersKey]);

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
    if (!loaded) return;
    const range = timelineRangeForViewport(viewport);
    if (loadedRange.current && range.startYear >= loadedRange.current.startYear && range.endYear <= loadedRange.current.endYear) {
      return;
    }
    if (timelineLoadTimer.current !== null) window.clearTimeout(timelineLoadTimer.current);
    timelineLoadTimer.current = window.setTimeout(() => {
      const requestVersion = timelineRequestVersion.current + 1;
      timelineRequestVersion.current = requestVersion;
      void dataSource.loadTimelineView(range, timelineFilters)
        .then((view) => {
          if (timelineRequestVersion.current !== requestVersion) return;
          loadedRange.current = range;
          setLoadError(null);
          store.getState().hydrate(view, true);
        })
        .catch((error: unknown) => {
          if (timelineRequestVersion.current !== requestVersion) return;
          setLoadError(error instanceof Error ? error.message : String(error));
        });
    }, TIMELINE_LOAD_DEBOUNCE_MS);
    return () => {
      if (timelineLoadTimer.current !== null) window.clearTimeout(timelineLoadTimer.current);
    };
  }, [dataSource, loaded, store, timelineFilters, timelineFiltersKey, viewport.centerYear, viewport.pixelsPerYear, viewport.widthPx]);
  useEffect(() => {
    // Until the graph has hydrated, the store only holds its neutral startup
    // camera. Publishing that value would make the shell remember a fictitious
    // location and could reopen the next timeline far from its actual nodes.
    if (!loaded && state.items.length === 0) return;
    onViewportChange?.({
      centerYear: viewport.centerYear,
      pixelsPerYear: viewport.pixelsPerYear,
    });
  }, [loaded, onViewportChange, state.items.length, viewport.centerYear, viewport.pixelsPerYear]);
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
  // Cull by year before collision placement. Filtering after `placeItems`
  // would still make every zoom frame walk the whole loaded window, which is
  // the expensive path that caused deep-LOD freezes.
  const renderYearRange = timelineRenderYearRange(viewport);
  const layoutItems = state.items.filter((item) => {
    const itemEnd = item.endYear ?? item.startYear;
    return itemEnd >= renderYearRange.startYear && item.startYear <= renderYearRange.endYear;
  });
  const allPlaced = placeItems(layoutItems, viewport, state.lanes);
  const categoryPlaced = allPlaced.filter((p) => visibleCategories[deriveTimelineCategory(p.item.node)]);
  const placed = categoryPlaced.filter((placement) => isInsideTimelineRenderBand(placement, viewport.widthPx));
  const ticks = generateTicks(viewport, tier);
  const lighting = state.litMap;
  const lightingActive = state.lightingOperatorId !== null;
  const showEmptyState = loaded && !loadError && state.items.length === 0;
  const activeCategories = TIMELINE_CATEGORIES.filter((category) =>
    state.items.some((item) => deriveTimelineCategory(item.node) === category.id),
  );
  const selectedNode = state.selectedNodeId
    ? state.nodes.find(({ node }) => node.graphNodeId === state.selectedNodeId)?.node
    : null;
  const frameableNode = selectedNode?.isTemporal ? selectedNode : null;
  const displayRelationField = relationField ?? (
    dataSource.relationFieldForEvent === undefined
      && state.selectedNodeId !== null
      && resonances.length > 0
      ? {
          subjectGraphNodeId: state.selectedNodeId,
          contextualNodes: resonances.map((resonance) => resonance.node),
          relationships: [],
        }
      : null
  );
  const hasRelationContext = displayRelationField !== null
    && (displayRelationField.relationships.length > 0 || resonances.length > 0);
  useEffect(() => {
    const next = [...new Set(state.relationships.map((relationship) => relationship.relType))].sort();
    if (next.length === 0) return;
    setKnownRelationTypes((current) => {
      const merged = [...new Set([...current, ...next])].sort();
      return current.length === merged.length && current.every((value, index) => value === merged[index])
        ? current
        : merged;
    });
  }, [state.relationships]);
  useEffect(() => {
    const next = [...new Set(state.items.flatMap((item) => item.node.evidenceTags))].sort();
    if (next.length === 0) return;
    setKnownTags((current) => {
      const merged = [...new Set([...current, ...next])].sort();
      return current.length === merged.length && current.every((value, index) => value === merged[index])
        ? current
        : merged;
    });
  }, [state.items]);
  const availableRelationTypes = [...new Set([
    ...knownRelationTypes,
    ...state.relationships.map((relationship) => relationship.relType),
  ])].sort();
  const availableTags = [...new Set([
    ...knownTags,
    ...state.items.flatMap((item) => item.node.evidenceTags),
  ])].sort();
  const renderedRelationships = showRelations
    ? state.relationships.filter((relationship) =>
        relationTypeFilter === null || relationTypeFilter.includes(relationship.relType),
      )
    : [];
  // Ticket #28: the global/temporal walk is the timeline's spine recomputed as a
  // traversable sequence of located, dated events. The working-set stack frames
  // sub-timelines in place (nested inside the walk, never a separate lens).
  const walk = useMemo(
    () => assembleTimelineWalk(
      state.nodes,
      state.relationships,
      state.workingSet.map((entry) => entry.graphNodeId),
    ),
    [state.nodes, state.relationships, state.workingSet],
  );
  const nodeTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const record of state.nodes) {
      map.set(record.node.graphNodeId, record.node.title);
    }
    return map;
  }, [state.nodes]);

  const handleSelect = (graphNodeId: string) => {
    store.getState().setSelected(graphNodeId);
    setRelationFieldOpen(false);
    const resonanceVersion = resonanceRequestVersion.current + 1;
    resonanceRequestVersion.current = resonanceVersion;
    setResonances([]);
    void dataSource.resonancesForInstance(graphNodeId).then((nextResonances) => {
      if (resonanceRequestVersion.current === resonanceVersion) setResonances(nextResonances);
    }).catch(() => {
      if (resonanceRequestVersion.current === resonanceVersion) setResonances([]);
    });

    const requestVersion = relationFieldRequestVersion.current + 1;
    relationFieldRequestVersion.current = requestVersion;
    setRelationField(null);
    if (dataSource.relationFieldForEvent) {
      void dataSource.relationFieldForEvent(graphNodeId).then((field) => {
        if (relationFieldRequestVersion.current === requestVersion) setRelationField(field);
      }).catch(() => {
        // Relation context is supplementary. Keep the selected historical
        // event interactive if a remote/local field read is temporarily unavailable.
        if (relationFieldRequestVersion.current === requestVersion) setRelationField(null);
      });
    }

    // Ticket #28: lazy relational expansion. Clicking a dated node loads its
    // real edges + neighbours into the working-set stack (opt-in, one node at a
    // time); the base timeline view stays light. Absent on read-only surfaces.
    if (dataSource.expandNode) {
      void dataSource.expandNode(graphNodeId).then((expansion) => {
        store.getState().expandNode(expansion);
      }).catch(() => {
        // Expansion is supplementary. A failed deep read must not close the
        // selection or surface as an unhandled rejection.
      });
    }
  };

  const handleOpenNode = (graphNodeId: string, node: GraphNode, includeRelationField = true) => {
    const contextField = includeRelationField ? relationField ?? undefined : undefined;
    const open = (nextNode: GraphNode) => onOpenNode(
      graphNodeId,
      nextNode,
      ...(contextField ? [contextField] : []),
    );
    setRelationFieldOpen(false);
    setRelationField(null);
    setResonances([]);
    // Open against the bounded timeline projection immediately. The reader
    // can mount while the optional full-document read runs, rather than
    // making a second IPC round-trip block the primary interaction.
    open(node);
    if (dataSource.loadNode) {
      void dataSource.loadNode(graphNodeId)
        .then((nextNode) => open(nextNode))
        .catch(() => {
          // The projection is already a valid reader record; a failed deep
          // read must not close it or surface as an unhandled rejection.
        });
    }
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
          graphNodeId, lane: snapshot.lane ?? FALLBACK_TIMELINE_LANE_ID, offsetY: snapshot.offsetY,
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

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    // React delegates wheel handlers as passive in Chromium. Timeline zoom
    // needs to own this gesture (and suppress page scroll), so register a
    // native non-passive listener rather than emitting a console error on
    // every zoom gesture.
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const currentViewport = store.getState().viewport();
      const rect = track.getBoundingClientRect();
      const anchorPx = event.clientX - rect.left;
      const factor = Math.pow(WHEEL_ZOOM_BASE, -event.deltaY);
      store.getState().zoom(factor, Number.isFinite(anchorPx) ? anchorPx : currentViewport.widthPx / 2);
    };
    track.addEventListener("wheel", handleWheel, { passive: false });
    return () => track.removeEventListener("wheel", handleWheel);
  }, [store]);

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
    if (deltaY !== 0) store.getState().panVertical(deltaY, verticalPanBounds(categoryPlaced, trackRef.current?.clientHeight ?? 480));
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
    const step = (timestamp: number) => {
      const navigation = navigationRef.current;
      if (!navigation || navigation.direction !== direction) return;
      if (navigation.lastFrameAt === null) {
        navigation.lastFrameAt = timestamp;
      } else {
        const frameSeconds = Math.min((timestamp - navigation.lastFrameAt) / 1_000, 0.05);
        navigation.speedPxPerSecond = navigation.phase === "accelerating"
          ? Math.min(
              TIMELINE_MAX_PAN_SPEED_PX_PER_SECOND,
              navigation.speedPxPerSecond + frameSeconds * TIMELINE_PAN_ACCELERATION_PX_PER_SECOND_SQUARED,
            )
          : Math.max(
              0,
              navigation.speedPxPerSecond - frameSeconds * TIMELINE_TAIL_DECELERATION_PX_PER_SECOND_SQUARED,
            );
        navigation.lastFrameAt = timestamp;
        if (navigation.speedPxPerSecond === 0) {
          navigationRef.current = null;
          return;
        }
        store.getState().pan(directionMultiplier * navigation.speedPxPerSecond * frameSeconds);
      }
      if (navigationRef.current === navigation) {
        navigation.frameId = window.requestAnimationFrame(step);
      }
    };
    navigationRef.current = {
      direction,
      frameId: window.requestAnimationFrame(step),
      lastFrameAt: null,
      speedPxPerSecond: 0,
      phase: "accelerating",
    };
  }, [stopTimelineNavigation, store]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        (event.key !== "ArrowLeft" && event.key !== "ArrowRight") ||
        shouldLeaveArrowKeyAlone(event.target)
      ) return;
      event.preventDefault();
      const key = event.key as "ArrowLeft" | "ArrowRight";
      if (heldNavigationKeys.current.has(key)) return;
      heldNavigationKeys.current.add(key);
      const direction = event.key === "ArrowLeft" ? "earlier" : "later";
      const navigation = navigationRef.current;
      if (navigation?.direction === direction) {
        navigation.phase = "accelerating";
        return;
      }
      // A reversal always discards the prior velocity. The new direction then
      // ramps from rest, so it never snaps through the axis with old momentum.
      startTimelineNavigation(direction);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      heldNavigationKeys.current.delete(event.key);
      const direction = event.key === "ArrowLeft" ? "earlier" : "later";
      const navigation = navigationRef.current;
      if (navigation?.direction === direction) navigation.phase = "coasting";
    };
    const handleWindowBlur = () => {
      heldNavigationKeys.current.clear();
      stopTimelineNavigation();
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [startTimelineNavigation, stopTimelineNavigation]);

  useEffect(() => stopTimelineNavigation, [stopTimelineNavigation]);

  return (
    <div className="timeline-lens" data-testid="timeline-lens">
      <div className="timeline-toolbar" data-testid="timeline-toolbar">
        <span className="timeline-tier" data-testid="timeline-tier">{tier}</span>
        {state.frame && (
          <div className="timeline-frame" data-testid="timeline-frame" aria-label="Timeline frame">
            <span className="timeline-frame-crumb" data-testid="timeline-frame-crumb">
              Earth / {state.frame.title}
            </span>
            <button
              type="button"
              data-testid="timeline-back-to-earth"
              onClick={() => store.getState().setFrameForNode(null)}
            >
              Back to Earth
            </button>
          </div>
        )}
        {!state.frame && frameableNode && (
          <button
            type="button"
            className="timeline-frame-action"
            data-testid="timeline-open-subtimeline"
            onClick={() => store.getState().setFrameForNode(frameableNode.graphNodeId)}
          >
            Open sub-timeline
          </button>
        )}
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
        <div className="timeline-filters" aria-label="Timeline context filters">
          <button
            type="button"
            className="timeline-filter"
            data-testid="timeline-toggle-relations"
            data-active={showRelations ? "true" : "false"}
            aria-label={`${showRelations ? "Hide" : "Show"} relation links`}
            aria-pressed={showRelations}
            onClick={() => setShowRelations((visible) => !visible)}
          >
            Links
          </button>
          <button
            type="button"
            className="timeline-filter"
            data-testid="timeline-toggle-archetypal"
            data-active={showArchetypalContext ? "true" : "false"}
            aria-label={`${showArchetypalContext ? "Hide" : "Show"} archetypal context`}
            aria-pressed={showArchetypalContext}
            onClick={() => setShowArchetypalContext((visible) => !visible)}
          >
            Archetypes
          </button>
        </div>
        {availableRelationTypes.length > 0 && (
          <div className="timeline-filters timeline-filters--secondary" aria-label="Timeline relation type filters">
            <span className="timeline-filter-label">Link types</span>
            {relationTypeFilter !== null && (
              <button
                type="button"
                className="timeline-filter"
                data-testid="timeline-relation-types-all"
                onClick={() => setRelationTypeFilter(null)}
              >
                All
              </button>
            )}
            {availableRelationTypes.map((relationType) => {
              const active = relationTypeFilter === null || relationTypeFilter.includes(relationType);
              return (
                <button
                  key={relationType}
                  type="button"
                  className="timeline-filter"
                  data-testid={`timeline-relation-type-${relationType}`}
                  data-active={active ? "true" : "false"}
                  aria-pressed={active}
                  onClick={() => setRelationTypeFilter((current) => {
                    if (current === null) return availableRelationTypes.filter((candidate) => candidate !== relationType);
                    return current.includes(relationType)
                      ? current.filter((candidate) => candidate !== relationType)
                      : [...current, relationType];
                  })}
                >
                  {relationType.replaceAll("_", " ")}
                </button>
              );
            })}
          </div>
        )}
        {availableTags.length > 0 && (
          <div className="timeline-filters timeline-filters--secondary" aria-label="Timeline tag filters">
            <span className="timeline-filter-label">Tags</span>
            {tagFilter.length > 0 && (
              <button
                type="button"
                className="timeline-filter"
                data-testid="timeline-tags-all"
                onClick={() => setTagFilter([])}
              >
                All
              </button>
            )}
            {availableTags.map((tag) => {
              const active = tagFilter.length === 0 || tagFilter.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  className="timeline-filter"
                  data-testid={`timeline-tag-${tag}`}
                  data-active={active ? "true" : "false"}
                  aria-pressed={active}
                  onClick={() => setTagFilter((current) => {
                    if (current.length === 0) return [tag];
                    return current.includes(tag)
                      ? current.filter((candidate) => candidate !== tag)
                      : [...current, tag];
                  })}
                >
                  {tag}
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
        {state.hovering.length > 0 && (
          <div
            className="timeline-hover-lane"
            data-testid="timeline-hover-lane"
            aria-label="Trans-temporal nodes hovering above this timeline"
          >
            {state.hovering.map((hover) => (
              <button
                key={hover.graphNodeId}
                type="button"
                className="timeline-hover-chip"
                onClick={() => onOpenNode(hover.graphNodeId, hover.node)}
              >
                {hover.node.title}
              </button>
            ))}
          </div>
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
            relationships={renderedRelationships}
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
                  onOpen={handleOpenNode}
                  onResize={handleResizeNode}
                  onCommit={commitTimelineLayout}
                  onColorTag={handleColorTag}
                  readOnly={!dataSource.saveTimelineLayout || p.item.relationCompanion}
                />
              );
            })}
          </div>
        </div>
      </div>
      {hasRelationContext && displayRelationField !== null && (
        <div
          className="timeline-relation-field-shell"
          onMouseEnter={() => setRelationFieldOpen(true)}
          onMouseLeave={() => setRelationFieldOpen(false)}
          onFocus={() => setRelationFieldOpen(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setRelationFieldOpen(false);
          }}
        >
          <button
            type="button"
            className="timeline-relation-field-trigger"
            data-testid="timeline-relation-field-trigger"
            aria-expanded={relationFieldOpen}
            onClick={() => setRelationFieldOpen((open) => !open)}
          >
            Relations
          </button>
          {relationFieldOpen && (
            <TimelineRelationField
              field={displayRelationField}
              resonances={resonances}
              showRelations={showRelations}
              showArchetypalContext={showArchetypalContext}
              onOpenNode={(graphNodeId, node) => handleOpenNode(graphNodeId, node, false)}
              onLightOperator={handleLightOperator}
            />
          )}
        </div>
      )}
      <TimelineWorkingSet
        workingSet={state.workingSet}
        onUnload={(graphNodeId) => store.getState().collapseNode(graphNodeId)}
        onClear={() => store.getState().clearWorkingSet()}
        onOpenNode={(graphNodeId, node) => handleOpenNode(graphNodeId, node, false)}
      />
      <TimelineWalk
        walk={walk}
        onSelectStop={(graphNodeId) => handleSelect(graphNodeId)}
        resolveNodeTitle={(graphNodeId) => nodeTitleById.get(graphNodeId) ?? null}
      />
    </div>
  );
}

function shouldLeaveArrowKeyAlone(target: EventTarget | null): boolean {
  if (document.querySelector('[role="dialog"][aria-modal="true"]')) return true;
  if (!(target instanceof HTMLElement)) return false;
  return target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""], [role="textbox"]') !== null;
}

function isInsideTimelineRenderBand(placement: PlacedItem, viewportWidth: number): boolean {
  const halfCardWidth = Math.max(placement.item.presentation.width, DEFAULT_TIMELINE_CARD_WIDTH_PX) / 2;
  const left = Math.min(placement.startPx, placement.endPx) - halfCardWidth;
  const right = Math.max(placement.startPx, placement.endPx) + halfCardWidth;
  return right >= -TIMELINE_RENDER_OVERSCAN_PX
    && left <= viewportWidth + TIMELINE_RENDER_OVERSCAN_PX;
}

function timelineRangeForViewport(viewport: { centerYear: number; pixelsPerYear: number; widthPx: number }): TimelineYearRange {
  const visibleYears = viewport.widthPx / Math.max(viewport.pixelsPerYear, Number.EPSILON);
  const bufferYears = Math.max(TIMELINE_MIN_QUERY_BUFFER_YEARS, visibleYears * 0.5);
  return {
    startYear: Math.floor(viewport.centerYear - visibleYears / 2 - bufferYears),
    endYear: Math.ceil(viewport.centerYear + visibleYears / 2 + bufferYears),
  };
}

function timelineRenderYearRange(viewport: { centerYear: number; pixelsPerYear: number; widthPx: number }): TimelineYearRange {
  const pixelsPerYear = Math.max(viewport.pixelsPerYear, Number.EPSILON);
  const visibleYears = viewport.widthPx / pixelsPerYear;
  const overscanYears = TIMELINE_RENDER_OVERSCAN_PX / pixelsPerYear;
  return {
    startYear: viewport.centerYear - visibleYears / 2 - overscanYears,
    endYear: viewport.centerYear + visibleYears / 2 + overscanYears,
  };
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
