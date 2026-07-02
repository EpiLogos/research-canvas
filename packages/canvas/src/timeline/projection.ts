import type { GraphNode, TemporalPrecision } from "./contracts";
import { parseTemporalInstant } from "./instant";
import { yearToPixel, type TimelineViewport } from "./viewport";

export interface TimelineItem {
  graphNodeId: string;
  node: GraphNode;
  startYear: number;
  /** null = ongoing / open-ended (no validTo). */
  endYear: number | null;
  precision: TemporalPrecision;
}

export interface PlacedItem {
  item: TimelineItem;
  startPx: number;
  endPx: number;
}

/**
 * Keep only temporally-located nodes with a parseable validFrom and project
 * them onto a numeric year axis. Trans-temporal nodes (isTemporal === false)
 * are never projected (WS0 §8.1). Sorted ascending by startYear.
 */
export function projectNodes(nodes: GraphNode[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const node of nodes) {
    if (!node.isTemporal) continue;
    const startYear = parseTemporalInstant(node.validFrom);
    if (startYear === null) continue;
    const endYear = parseTemporalInstant(node.validTo);
    items.push({
      graphNodeId: node.graphNodeId,
      node,
      startYear,
      endYear,
      precision: node.temporalPrecision ?? "year",
    });
  }
  items.sort((a, b) => a.startYear - b.startYear);
  return items;
}

export function placeItems(
  items: TimelineItem[],
  viewport: TimelineViewport,
): PlacedItem[] {
  return items.map((item) => {
    const startPx = yearToPixel(viewport, item.startYear);
    const endPx =
      item.endYear === null ? startPx : yearToPixel(viewport, item.endYear);
    return { item, startPx, endPx };
  });
}
