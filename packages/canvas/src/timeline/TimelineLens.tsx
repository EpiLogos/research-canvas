import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import { useStore } from "zustand";

import type { ArchetypalLighting, GraphNode, LitInstance } from "./contracts";
import { createTimelineStore } from "./timelineStore";
import { placeItems } from "./projection";
import { generateTicks } from "./ticks";
import { TimelineAxis } from "./TimelineAxis";
import { TimelineNode } from "./TimelineNode";
import { ResonancePopover } from "./ResonancePopover";

export interface TimelineDataSource {
  loadTimelineNodes(): Promise<GraphNode[]>;
  archetypalLighting(operatorGraphNodeId: string): Promise<ArchetypalLighting>;
  resonancesForInstance(graphNodeId: string): Promise<LitInstance[]>;
}

export interface TimelineLensProps {
  dataSource: TimelineDataSource;
  onOpenNode: (graphNodeId: string) => void;
}

const AXIS_HEIGHT = 48;
// Wheel-zoom sensitivity: factor per pixel of deltaY, exponential so a large
// wheel/trackpad delta produces a proportionally larger zoom change. Negative
// deltaY (scroll up / pinch out) zooms in.
const WHEEL_ZOOM_BASE = 1.003;

export function TimelineLens({ dataSource, onOpenNode }: TimelineLensProps): JSX.Element {
  const store = useMemo(() => createTimelineStore(), []);
  const state = useStore(store);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [resonances, setResonances] = useState<LitInstance[]>([]);

  // Load timeline nodes once on mount.
  useEffect(() => {
    let cancelled = false;
    void dataSource.loadTimelineNodes().then((nodes) => {
      if (!cancelled) store.getState().hydrate(nodes);
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
  const placed = placeItems(state.items, viewport);
  const ticks = generateTicks(viewport, tier);
  const lighting = state.litMap;
  const lightingActive = state.lightingOperatorId !== null;

  const handleSelect = (graphNodeId: string) => {
    store.getState().setSelected(graphNodeId);
    void dataSource.resonancesForInstance(graphNodeId).then(setResonances);
  };

  const handleLightOperator = (operatorGraphNodeId: string) => {
    void dataSource.archetypalLighting(operatorGraphNodeId).then((result) => {
      store.getState().setLighting(result);
    });
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
        <div className="timeline-nodes" style={{ position: "relative" }}>
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
                onSelect={handleSelect}
                onOpen={onOpenNode}
              />
            );
          })}
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
