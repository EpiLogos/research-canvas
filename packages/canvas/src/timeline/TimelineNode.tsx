import { useEffect, useRef } from "react";
import type { CSSProperties, JSX, PointerEvent as ReactPointerEvent } from "react";
import { computeCardViewportFade, type PlacedItem } from "./projection";
import type { LitNodeState } from "./lighting";
import { categoryDefinition, deriveTimelineCategory } from "./categories";
import { DEFAULT_TIMELINE_CARD_HEIGHT_PX, DEFAULT_TIMELINE_CARD_WIDTH_PX } from "./projection";

const MIN_CARD_WIDTH = 180;
const MAX_CARD_WIDTH = 520;
const MIN_CARD_HEIGHT = 72;
const MAX_CARD_HEIGHT = 260;

type ResizeCorner = "nw" | "ne" | "sw" | "se";

interface TimelineCardGeometry {
  positionX: number;
  positionY: number;
  width: number;
  height: number;
}

export interface TimelineNodeProps {
  placed: PlacedItem;
  lit: LitNodeState | null;
  selected: boolean;
  dimmed: boolean;
  filtered: boolean;
  viewportWidth?: number;
  onSelect: (nodeId: string) => void;
  onOpen: (nodeId: string) => void;
  onResize: (nodeId: string, size: TimelineCardGeometry) => void;
  onColorTag: (nodeId: string, style: { dotColour: string; bgColour: string; textColour?: string }) => void;
}

export function TimelineNode({
  placed,
  lit,
  selected,
  dimmed,
  filtered,
  viewportWidth,
  onSelect,
  onOpen,
  onResize,
  onColorTag,
}: TimelineNodeProps): JSX.Element {
  const { item, startPx, endPx } = placed;
  const spanWidth = Math.max(endPx - startPx, 0);
  const laneOffset = 68 + placed.laneIndex * 78;
  const summary = item.node.summary.trim();
  const category = deriveTimelineCategory(item.node);
  const categoryStyle = categoryDefinition(category);
  const positionX = 0;
  const timelineCard = item.layout.style.__timelineCard;
  const positionY = timelineCard?.offsetY ?? 0;
  const cardWidth = clampNumber(timelineCard?.width || DEFAULT_TIMELINE_CARD_WIDTH_PX, MIN_CARD_WIDTH, MAX_CARD_WIDTH);
  const cardHeight = clampNumber(timelineCard?.height || DEFAULT_TIMELINE_CARD_HEIGHT_PX, MIN_CARD_HEIGHT, MAX_CARD_HEIGHT);
  const dragState = useRef<{
    mode: "resize" | "move";
    pointerId: number;
    startX: number;
    startY: number;
    corner?: ResizeCorner;
    geometry: TimelineCardGeometry;
  } | null>(null);
  const suppressClick = useRef(false);
  const cardLeft = positionX - cardWidth / 2;
  const cardTop =
    placed.laneSide === "above"
      ? -laneOffset - cardHeight + positionY
      : laneOffset + positionY;
  const connectorOffset =
    placed.laneSide === "above"
      ? Math.max(16, laneOffset - positionY)
      : Math.max(16, laneOffset + positionY);
  const edgeFade =
    viewportWidth === undefined
      ? { left: 0, right: 0, edge: "none" as const }
      : computeCardViewportFade({
          startPx,
          positionX,
          width: cardWidth,
          viewportWidth,
        });
  const style = {
    position: "absolute",
    left: `${startPx}px`,
    top: "50%",
    opacity: dimmed ? 0.25 : 1,
    "--lane-offset": `${connectorOffset}px`,
  } as CSSProperties;

  function handlePointerMove(event: PointerEvent) {
    const current = dragState.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const deltaX = event.clientX - current.startX;
    const deltaY = event.clientY - current.startY;
    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) {
      suppressClick.current = true;
    }

    const next =
      current.mode === "move"
        ? {
            ...current.geometry,
            positionY: clampNumber(current.geometry.positionY + deltaY, -360, 360),
          }
        : resizeGeometry(current.geometry, current.corner ?? "se", placed.laneSide, deltaX, deltaY);
    onResize(item.graphNodeId, next);
  }

  function handlePointerUp(event: PointerEvent) {
    if (dragState.current?.pointerId === event.pointerId) {
      dragState.current = null;
    }
  }

  useEffect(() => {
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  });

  const beginDrag = (event: ReactPointerEvent<HTMLElement>, mode: "move" | "resize", corner?: ResizeCorner) => {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    dragState.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      corner,
      geometry: {
        positionX,
        positionY,
        width: cardWidth,
        height: cardHeight,
      },
    };
    if (mode === "resize") {
      suppressClick.current = true;
    }
  };

  return (
    <div
      data-testid={`timeline-node-${item.graphNodeId}`}
      data-entity-type={item.node.entityType}
      data-lit={lit ? lit.dominance : undefined}
      data-rel-type={lit ? lit.relType : undefined}
      data-selected={selected ? "true" : undefined}
      data-dimmed={dimmed ? "true" : undefined}
      data-filtered={filtered ? "true" : undefined}
      data-category={category}
      className={`timeline-node timeline-node--${placed.laneSide}`}
      style={style}
      onClick={(event) => {
        if (suppressClick.current) {
          suppressClick.current = false;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onSelect(item.graphNodeId);
      }}
      onDoubleClick={() => onOpen(item.graphNodeId)}
    >
      {spanWidth > 1 && (
        <div
          className="timeline-node-span"
          data-testid={`timeline-node-span-${item.graphNodeId}`}
          style={{ width: `${spanWidth}px` }}
        />
      )}
      <span className="timeline-node-dot" />
      <span className="timeline-node-connector" />
      <div
        className="timeline-node-card"
        data-testid={`timeline-node-card-${item.graphNodeId}`}
        data-edge-fade={edgeFade.edge}
        onPointerDown={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest("button") || target.closest(".timeline-node-resize")) return;
          beginDrag(event, "move");
        }}
        style={{
          left: `${cardLeft}px`,
          top: `${cardTop}px`,
          bottom: "auto",
          transform: "none",
          width: `${cardWidth}px`,
          height: `${cardHeight}px`,
          backgroundColor: item.layout.style.bgColour ?? categoryStyle.background,
          borderColor: item.layout.style.dotColour ?? categoryStyle.color,
          color: item.layout.style.textColour ?? undefined,
          "--timeline-card-offset-y": `${positionY}px`,
          "--timeline-edge-fade-left": String(edgeFade.left),
          "--timeline-edge-fade-right": String(edgeFade.right),
        } as CSSProperties}
      >
        <span
          className="timeline-node-category"
          title={categoryStyle.label}
          style={{ backgroundColor: item.layout.style.dotColour ?? categoryStyle.color }}
        />
        <span className="timeline-node-date">{formatItemDate(item)}</span>
        <span className="timeline-node-title">{item.node.title}</span>
        {summary && (
          <span
            className="timeline-node-summary"
            data-testid={`timeline-node-summary-${item.graphNodeId}`}
          >
            {summary}
          </span>
        )}
        <button
          type="button"
          className="timeline-node-color"
          data-testid={`timeline-node-color-${item.graphNodeId}`}
          aria-label={`Tag ${item.node.title} as ${categoryStyle.label}`}
          onClick={(event) => {
            event.stopPropagation();
            onColorTag(item.graphNodeId, {
              dotColour: categoryStyle.color,
              bgColour: categoryStyle.background,
            });
          }}
        >
          <span
            className="timeline-node-color__swatch"
            style={{ backgroundColor: categoryStyle.color }}
          />
        </button>
        {(["nw", "ne", "sw", "se"] as const).map((corner) => (
          <span
            key={corner}
            role="presentation"
            className={`timeline-node-resize timeline-node-resize--${corner}`}
            data-testid={`timeline-node-resize-${item.graphNodeId}-${corner}`}
            onPointerDown={(event) => beginDrag(event, "resize", corner)}
          />
        ))}
      </div>
    </div>
  );
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

function resizeGeometry(
  start: TimelineCardGeometry,
  corner: ResizeCorner,
  laneSide: PlacedItem["laneSide"],
  deltaX: number,
  deltaY: number,
): TimelineCardGeometry {
  const nextWidth = corner.includes("e")
    ? clampNumber(start.width + deltaX, MIN_CARD_WIDTH, MAX_CARD_WIDTH)
    : clampNumber(start.width - deltaX, MIN_CARD_WIDTH, MAX_CARD_WIDTH);
  const nextHeight = corner.includes("s")
    ? clampNumber(start.height + deltaY, MIN_CARD_HEIGHT, MAX_CARD_HEIGHT)
    : clampNumber(start.height - deltaY, MIN_CARD_HEIGHT, MAX_CARD_HEIGHT);

  const heightDelta = nextHeight - start.height;
  let positionY = start.positionY;
  if (laneSide === "above" && corner.includes("s")) {
    positionY += heightDelta;
  }
  if (laneSide === "below" && corner.includes("n")) {
    positionY -= heightDelta;
  }

  return {
    positionX: 0,
    positionY: clampNumber(positionY, -360, 360),
    width: nextWidth,
    height: nextHeight,
  };
}

function formatItemDate(item: PlacedItem["item"]): string {
  const start = formatYear(item.startYear);
  if (item.endYear === null) return start;
  return `${start} to ${formatYear(item.endYear)}`;
}

function formatYear(year: number): string {
  const rounded = year < 0 ? Math.ceil(year) : Math.floor(year);
  if (rounded < 0) return `${Math.abs(rounded)} BCE`;
  return `${rounded}`;
}
