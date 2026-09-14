import { useRef } from "react";
import type { CSSProperties, JSX, PointerEvent as ReactPointerEvent } from "react";
import { computeCardViewportFade, type PlacedItem } from "./projection";
import type { LitNodeState } from "./lighting";
import type { GraphNode } from "./contracts";
import { categoryDefinition, deriveTimelineCategory } from "./categories";
import { DEFAULT_TIMELINE_CARD_HEIGHT_PX, DEFAULT_TIMELINE_CARD_WIDTH_PX } from "./projection";

const MIN_CARD_WIDTH = 180;
const MAX_CARD_WIDTH = 520;
const MIN_CARD_HEIGHT = 72;
const MAX_CARD_HEIGHT = 260;
const DRAG_ACTIVATION_DISTANCE_PX = 2;

type ResizeCorner = "nw" | "ne" | "sw" | "se";
export type TimelineNodeLod = "marker" | "label" | "detail";

type TimelineProjectedGraphNode = GraphNode & {
  timelinePlaceName?: string | null;
  timelineColorTag?: string | null;
};

interface TimelineCardGeometry {
  positionX: number;
  positionY: number;
  width: number;
  height: number;
}

export interface TimelineNodeProps {
  placed: PlacedItem;
  lod?: TimelineNodeLod;
  lit: LitNodeState | null;
  selected: boolean;
  dimmed: boolean;
  filtered: boolean;
  viewportWidth?: number;
  onSelect: (nodeId: string) => void;
  onOpen: (nodeId: string, node: GraphNode) => void;
  onResize: (nodeId: string, size: TimelineCardGeometry) => void;
  onCommit?: (nodeId: string) => void;
  onColorTag: (nodeId: string, style: { dotColour: string; bgColour: string; textColour?: string }) => void;
  readOnly?: boolean;
}

export function TimelineNode({
  placed,
  lod = "detail",
  lit,
  selected,
  dimmed,
  filtered,
  viewportWidth,
  onSelect,
  onOpen,
  onResize,
  onCommit,
  onColorTag,
  readOnly = false,
}: TimelineNodeProps): JSX.Element {
  const { item, startPx, endPx } = placed;
  const projectedNode = item.node as TimelineProjectedGraphNode;
  const spanWidth = Math.max(endPx - startPx, 0);
  const laneOffset = 68 + placed.laneIndex * 78;
  const summary = item.node.summary.trim();
  const category = deriveTimelineCategory(item.node);
  const categoryStyle = categoryDefinition(category);
  const placeName = projectedNode.timelinePlaceName ?? item.node.place?.names[0]?.name ?? null;
  const colorTag = projectedNode.timelineColorTag ?? category;
  const positionX = 0;
  const positionY = item.presentation.offsetY;
  const cardWidth = clampNumber(item.presentation.width || DEFAULT_TIMELINE_CARD_WIDTH_PX, MIN_CARD_WIDTH, MAX_CARD_WIDTH);
  const cardHeight = clampNumber(item.presentation.height || DEFAULT_TIMELINE_CARD_HEIGHT_PX, MIN_CARD_HEIGHT, MAX_CARD_HEIGHT);
  const dragState = useRef<{
    mode: "resize" | "move";
    pointerId: number;
    startX: number;
    startY: number;
    corner?: ResizeCorner;
    geometry: TimelineCardGeometry;
    didMutate: boolean;
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

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const current = dragState.current;
    if (!current || event.pointerId !== current.pointerId) return;
    const deltaX = event.clientX - current.startX;
    const deltaY = event.clientY - current.startY;
    const movedFarEnough = current.mode === "move"
      ? Math.abs(deltaY) > DRAG_ACTIVATION_DISTANCE_PX
      : Math.abs(deltaX) > DRAG_ACTIVATION_DISTANCE_PX || Math.abs(deltaY) > DRAG_ACTIVATION_DISTANCE_PX;
    if (!current.didMutate && !movedFarEnough) return;
    if (!current.didMutate) {
      current.didMutate = true;
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

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const current = dragState.current;
    if (current?.pointerId === event.pointerId) {
      dragState.current = null;
      if (current.didMutate) onCommit?.(item.graphNodeId);
    }
  }

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
      didMutate: false,
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
      data-relation-companion={item.relationCompanion ? "true" : undefined}
      data-category={category}
      data-lod={lod}
      className={`timeline-node timeline-node--${placed.laneSide}`}
      style={style}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={(event) => {
        if (suppressClick.current) {
          suppressClick.current = false;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onSelect(item.graphNodeId);
      }}
      onDoubleClick={() => onOpen(item.graphNodeId, item.node)}
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
      {lod === "marker" ? (
        <span
          className="timeline-node-marker"
          data-testid={`timeline-node-marker-${item.graphNodeId}`}
          title={summary ? `${item.node.title} — ${summary}` : item.node.title}
          style={{ color: item.presentation.style.dotColour ?? categoryStyle.color }}
        >
          {item.node.title}
        </span>
      ) : (
      <div
        className="timeline-node-card"
        data-lod={lod}
        data-testid={`timeline-node-card-${item.graphNodeId}`}
        data-edge-fade={edgeFade.edge}
        onPointerDown={(event) => {
          const target = event.target as HTMLElement;
          // A card interaction must never start the timeline camera pan. This
          // matters in read-only timelines too: double-click remains a reader
          // action even when drag/resize persistence is unavailable.
          if (readOnly || target.closest("button") || target.closest(".timeline-node-resize")) {
            event.stopPropagation();
            return;
          }
          beginDrag(event, "move");
        }}
        style={{
          left: `${cardLeft}px`,
          top: `${cardTop}px`,
          bottom: "auto",
          transform: "none",
          width: `${cardWidth}px`,
          height: `${cardHeight}px`,
          backgroundColor: item.presentation.style.bgColour ?? categoryStyle.background,
          borderColor: item.presentation.style.dotColour ?? categoryStyle.color,
          color: item.presentation.style.textColour ?? undefined,
          "--timeline-card-offset-y": `${positionY}px`,
          "--timeline-edge-fade-left": String(edgeFade.left),
          "--timeline-edge-fade-right": String(edgeFade.right),
        } as CSSProperties}
      >
        <div
          className="timeline-card-contract"
          data-testid={`timeline-card-${item.graphNodeId}`}
          data-entity-type={item.node.entityType}
          data-color-tag={colorTag}
          style={{ display: "contents" }}
        >
          <span
            className="timeline-node-category"
            title={categoryStyle.label}
            style={{ backgroundColor: item.presentation.style.dotColour ?? categoryStyle.color }}
          />
          <span
            className="timeline-node-entity-icon"
            data-testid={`timeline-node-entity-icon-${item.graphNodeId}`}
            aria-label={`${item.node.entityType} entity`}
            title={item.node.entityType}
          >
            {entityTypeGlyph(item.node.entityType)}
          </span>
          <span className="timeline-node-date">
            {item.relationCompanion ? "linked context" : formatItemDate(item)}
          </span>
          <span className="timeline-node-title">{item.node.title}</span>
          {placeName && (
            <span
              className="timeline-node-place"
              data-testid={`timeline-node-place-${item.graphNodeId}`}
            >
              {placeName}
            </span>
          )}
          {(lod === "detail" || lod === "label") && summary && (
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
            disabled={readOnly}
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
              onPointerDown={(event) => { if (!readOnly) beginDrag(event, "resize", corner); }}
            />
          ))}
        </div>
      </div>
      )}
    </div>
  );
}

function entityTypeGlyph(entityType: GraphNode["entityType"]): string {
  switch (entityType) {
    case "Event": return "◆";
    case "Place": return "⌖";
    case "Figure":
    case "People": return "●";
    case "Institution": return "▣";
    case "Source": return "▤";
    case "Claim": return "?";
    case "Interpretation": return "≈";
    case "Archetype":
    case "Dynamic":
    case "PsychoidOperator": return "✦";
    case "Myth": return "◈";
    case "Work": return "▱";
    case "Constellation": return "⠿";
    default: return "•";
  }
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