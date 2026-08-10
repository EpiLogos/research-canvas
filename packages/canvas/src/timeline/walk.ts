import type {
  GraphRelationship,
  TimelineViewNode,
} from "./contracts";
import type { TimelineFrameState } from "./frames";
import { parseTemporalInstant } from "./instant";
import { frameStateForNode, projectSubTimeline, relatedNodeIds } from "./frames";
import { projectNodes } from "./projection";

/**
 * Global/temporal walk (ticket #28, D13 §4.5): the timeline composes into a
 * traversable sequence of located, dated events across the project — the spine
 * connecting timeline → places → stories. Any node can frame a sub-timeline
 * (a place's history, a figure's life, an event's causes), mapped in place
 * inside the walk (nested), not as a separate lens. Earth remains the spatial
 * zero-case: the walk spans the whole project, and a located stop carries its
 * place frame; an unlocated stop still appears — the walk is never silently
 * dropped.
 */
export interface TimelineWalkStop {
  graphNodeId: string;
  title: string;
  validFrom: string;
  validTo: string | null;
  /** The place a LOCATED_AT relationship ties this event to, if any. */
  placeGraphNodeId: string | null;
  placeTitle: string | null;
  located: boolean;
  /** A nested sub-timeline frame mapped in place for this stop, if any. */
  frame: TimelineFrameState | null;
  /** Member graph node ids of the nested frame (frame node + related, clamped). */
  frameMembers: string[];
}

export interface TimelineWalk {
  stops: TimelineWalkStop[];
  locatedCount: number;
  subtimelineCount: number;
}

/**
 * Assemble the walk from the timeline view's dated nodes. Stops are the dated
 * events in ascending temporal order (the same projection as the base view, so
 * the walk's spine is the timeline itself). A LOCATED_AT relationship resolves
 * a stop's place frame; frameNodeIds (typically the working-set stack) nest
 * sub-timelines in place.
 */
export function assembleTimelineWalk(
  nodes: TimelineViewNode[],
  relationships: GraphRelationship[],
  frameNodeIds: string[] = [],
): TimelineWalk {
  const items = projectNodes(nodes);
  const nodeById = new Map(nodes.map((record) => [record.node.graphNodeId, record.node]));
  const placeById = new Map<string, { graphNodeId: string; title: string }>();
  for (const relationship of relationships) {
    if (relationship.relType !== "LOCATED_AT") continue;
    for (const [eventId, placeId] of [
      [relationship.sourceGraphNodeId, relationship.targetGraphNodeId],
      [relationship.targetGraphNodeId, relationship.sourceGraphNodeId],
    ]) {
      if (placeById.has(eventId)) continue;
      const place = nodeById.get(placeId);
      if (!place || place.entityType !== "Place") continue;
      placeById.set(eventId, { graphNodeId: placeId, title: place.title });
    }
  }
  const frameIds = new Set(frameNodeIds);

  const stops: TimelineWalkStop[] = [];
  for (const item of items) {
    // A LOCATED_AT relationship ties an event to its place; a Place node is
    // itself spatially located (its own zero-case is Earth).
    const selfPlace =
      item.node.entityType === "Place"
        ? { graphNodeId: item.graphNodeId, title: item.node.title }
        : null;
    const place = placeById.get(item.graphNodeId) ?? selfPlace;
    let frame: TimelineFrameState | null = null;
    let frameMembers: string[] = [];
    if (frameIds.has(item.graphNodeId)) {
      frame = frameStateForNode(nodes, item.graphNodeId);
      if (frame) {
        frameMembers = projectSubTimeline(items, relationships, frame).map(
          (member) => member.graphNodeId,
        );
      }
    }
    stops.push({
      graphNodeId: item.graphNodeId,
      title: item.node.title,
      validFrom: item.node.validFrom ?? "",
      validTo: item.node.validTo ?? null,
      placeGraphNodeId: place?.graphNodeId ?? null,
      placeTitle: place?.title ?? null,
      located: place !== null,
      frame,
      frameMembers,
    });
  }

  let locatedCount = 0;
  let subtimelineCount = 0;
  for (const stop of stops) {
    if (stop.located) locatedCount += 1;
    if (stop.frame) subtimelineCount += 1;
  }

  return { stops, locatedCount, subtimelineCount };
}

/** The complete set of node ids participating in the walk (stops + members). */
export function timelineWalkNodeIds(walk: TimelineWalk): Set<string> {
  const ids = new Set<string>();
  for (const stop of walk.stops) {
    ids.add(stop.graphNodeId);
    for (const member of stop.frameMembers) ids.add(member);
  }
  return ids;
}

/**
 * The stop's own date is its temporal anchor; when a nested frame exists, its
 * window governs the frame's members. This mirrors the timeline frame semantics
 * (`frames.ts`) so the walk reads the same dates as the axis.
 */
export function timelineWalkStopYear(stop: TimelineWalkStop): number | null {
  return parseTemporalInstant(stop.validFrom);
}

export { relatedNodeIds };
