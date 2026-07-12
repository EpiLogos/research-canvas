import type { GraphNode, TemporalPrecision, TimelineLane, TimelineViewNode } from "./contracts";
import { parseTemporalInstant } from "./instant";
import { yearToPixel, type TimelineViewport } from "./viewport";

export interface TimelineItem {
  graphNodeId: string;
  node: GraphNode;
  presentation: TimelinePresentation;
  startYear: number;
  /** null = ongoing / open-ended (no validTo). */
  endYear: number | null;
  precision: TemporalPrecision;
}

export interface TimelinePresentation {
  lane: string | null;
  offsetY: number;
  width: number;
  height: number;
  style: Record<string, unknown> & { dotColour?: string; bgColour?: string; textColour?: string };
  layoutRevision: number | null;
}

export interface PlacedItem {
  item: TimelineItem;
  startPx: number;
  endPx: number;
  laneIndex: number;
  laneSide: "above" | "below";
}

export const DEFAULT_TIMELINE_CARD_WIDTH_PX = 240;
export const DEFAULT_TIMELINE_CARD_HEIGHT_PX = 72;
const VIEWPORT_EDGE_FADE_PX = 96;
const CARD_GAP_PX = 16;
const LANE_ORDER: readonly PlacedItem["laneSide"][] = [
  "above",
  "below",
  "above",
  "below",
  "above",
  "below",
  "above",
  "below",
];

/**
 * Keep only temporally-located nodes with a parseable validFrom and project
 * them onto a numeric year axis. Trans-temporal nodes (isTemporal === false)
 * are never projected (WS0 §8.1). Sorted ascending by startYear.
 */
export function projectNodes(records: TimelineViewNode[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const record of records) {
    const { node, anchor, layoutOverride } = record;
    if (!node.isTemporal) continue;
    const startYear = parseTemporalInstant(anchor.validFrom);
    if (startYear === null) continue;
    const endYear = parseTemporalInstant(anchor.validTo);
    items.push({
      graphNodeId: node.graphNodeId,
      node,
      presentation: {
        lane: layoutOverride?.lane ?? null,
        offsetY: layoutOverride?.offsetY ?? 0,
        width: layoutOverride?.width ?? DEFAULT_TIMELINE_CARD_WIDTH_PX,
        height: layoutOverride?.height ?? DEFAULT_TIMELINE_CARD_HEIGHT_PX,
        style: layoutOverride?.style ?? {},
        layoutRevision: layoutOverride?.layoutRevision ?? null,
      },
      startYear,
      endYear,
      precision: anchor.precision,
    });
  }
  items.sort((a, b) => a.startYear - b.startYear);
  return items;
}

export function placeItems(
  items: TimelineItem[],
  viewport: TimelineViewport,
  laneDefinitions: TimelineLane[] = [],
): PlacedItem[] {
  const explicitIds = Array.from(new Set([
    ...laneDefinitions.map((lane) => lane.id),
    ...items.map((item) => item.presentation.lane).filter((lane): lane is string => lane !== null).sort(),
  ]));
  const explicitSlots = new Map(explicitIds.map((id, index) => [id, index]));
  const laneEnds = new Array(LANE_ORDER.length).fill(Number.NEGATIVE_INFINITY);
  return items.map((item) => {
    const startPx = yearToPixel(viewport, item.startYear);
    const endPx =
      item.endYear === null ? startPx : yearToPixel(viewport, item.endYear);
    const explicitSlot = item.presentation.lane === null ? undefined : explicitSlots.get(item.presentation.lane);
    const autoSlot = chooseLaneSlot(laneEnds, startPx);
    const laneSlot = explicitSlot ?? explicitIds.length + autoSlot;
    if (explicitSlot === undefined) laneEnds[autoSlot] = startPx + cardWidth(item.presentation) + CARD_GAP_PX;
    return {
      item,
      startPx,
      endPx,
      laneIndex: Math.floor(laneSlot / 2),
      laneSide: LANE_ORDER[laneSlot % LANE_ORDER.length],
    };
  });
}

export interface CardViewportFadeInput {
  startPx: number;
  positionX: number;
  width: number;
  viewportWidth: number;
  fadeDistancePx?: number;
}

export interface CardViewportFade {
  left: number;
  right: number;
  edge: "left" | "right" | "both" | "none";
}

export function computeCardViewportFade({
  startPx,
  positionX,
  width,
  viewportWidth,
  fadeDistancePx = VIEWPORT_EDGE_FADE_PX,
}: CardViewportFadeInput): CardViewportFade {
  if (viewportWidth <= 0 || fadeDistancePx <= 0) {
    return { left: 0, right: 0, edge: "none" };
  }

  const cardLeft = startPx + positionX - width / 2;
  const cardRight = cardLeft + width;
  const left = clamp01((fadeDistancePx - cardLeft) / fadeDistancePx);
  const right = clamp01((fadeDistancePx - (viewportWidth - cardRight)) / fadeDistancePx);
  const edge = left > 0 && right > 0 ? "both" : left > 0 ? "left" : right > 0 ? "right" : "none";
  return { left, right, edge };
}

function cardWidth(presentation: TimelinePresentation): number {
  return Math.max(presentation.width, DEFAULT_TIMELINE_CARD_WIDTH_PX);
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return Math.round(value * 1000) / 1000;
}

function chooseLaneSlot(laneEnds: number[], startPx: number): number {
  const openSlot = laneEnds.findIndex((endPx) => endPx <= startPx);
  if (openSlot !== -1) return openSlot;

  let earliestSlot = 0;
  for (let i = 1; i < laneEnds.length; i += 1) {
    if (laneEnds[i] < laneEnds[earliestSlot]) {
      earliestSlot = i;
    }
  }
  return earliestSlot;
}
