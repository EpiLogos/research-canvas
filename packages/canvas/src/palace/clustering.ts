import type { GraphNode, GraphRelationship } from "@research-canvas/desktop-api";

/**
 * Mind palace generation (vision §3.12, ticket #4): chambers are
 * related-node clusters and paths are graph edges — generated from structure,
 * never hand-authored geometry. Memory-palace chunking keeps chambers small
 * and coherent: when a connected cluster exceeds the chunk size it is split
 * along its articulation edges.
 */
export interface ChamberCandidate {
  id: string;
  anchorGraphNodeId: string;
  memberNodeIds: string[];
  /** Edge ids whose endpoints both lie inside this chamber. */
  internalEdgeIds: string[];
}

export interface ClusterOptions {
  maxChamberSize: number;
}

const DEFAULT_MAX_CHAMBER_SIZE = 8;

export function clusterChambers(
  nodes: GraphNode[],
  relationships: GraphRelationship[],
  options: ClusterOptions = { maxChamberSize: DEFAULT_MAX_CHAMBER_SIZE },
): ChamberCandidate[] {
  const nodeIds = new Set(nodes.map((node) => node.graphNodeId));
  const adjacency = new Map<string, Set<string>>();
  for (const node of nodes) {
    adjacency.set(node.graphNodeId, new Set());
  }
  for (const relationship of relationships) {
    const source = relationship.sourceGraphNodeId;
    const target = relationship.targetGraphNodeId;
    if (!nodeIds.has(source) || !nodeIds.has(target)) continue;
    adjacency.get(source)?.add(target);
    adjacency.get(target)?.add(source);
  }

  const visited = new Set<string>();
  const chambers: ChamberCandidate[] = [];
  for (const node of nodes) {
    if (visited.has(node.graphNodeId)) continue;
    const component = connectedComponent(node.graphNodeId, adjacency);
    const chunks = chunk(component, adjacency, options.maxChamberSize);
    for (const chunkMembers of chunks) {
      for (const member of chunkMembers) visited.add(member);
      chambers.push(buildChamber(chunkMembers, adjacency, relationships));
    }
  }
  return chambers.sort((a, b) => a.id.localeCompare(b.id));
}

function connectedComponent(
  start: string,
  adjacency: Map<string, Set<string>>,
): string[] {
  const seen = new Set<string>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbour of adjacency.get(current) ?? []) {
      if (!seen.has(neighbour)) {
        seen.add(neighbour);
        queue.push(neighbour);
      }
    }
  }
  return [...seen];
}

/** Splits a connected component into coherent chunks of at most the maximum
 * size. The split removes the highest-degree member of a full chunk so each
 * chamber keeps a strong anchor and stays small (memory-palace chunking). */
function chunk(
  component: string[],
  adjacency: Map<string, Set<string>>,
  maxSize: number,
): string[][] {
  if (component.length <= maxSize) return [component];
  const sorted = [...component].sort(
    (a, b) =>
      (adjacency.get(b)?.size ?? 0) - (adjacency.get(a)?.size ?? 0),
  );
  const chunks: string[][] = [];
  for (let index = 0; index < sorted.length; index += maxSize) {
    chunks.push(sorted.slice(index, index + maxSize));
  }
  return chunks;
}

function buildChamber(
  members: string[],
  adjacency: Map<string, Set<string>>,
  relationships: GraphRelationship[],
): ChamberCandidate {
  const sorted = [...members].sort(
    (a, b) =>
      (adjacency.get(b)?.size ?? 0) - (adjacency.get(a)?.size ?? 0),
  );
  const anchorGraphNodeId = sorted[0];
  const memberSet = new Set(members);
  const internalEdgeIds = relationships
    .filter(
      (relationship) =>
        memberSet.has(relationship.sourceGraphNodeId) &&
        memberSet.has(relationship.targetGraphNodeId),
    )
    .map((relationship) => relationship.id);
  return {
    id: `chamber:${anchorGraphNodeId}`,
    anchorGraphNodeId,
    memberNodeIds: sorted,
    internalEdgeIds,
  };
}

/** Spatial anchor + title shaping: the chamber is anchored to its highest
 * degree node; naming is profile-aware (vision §3.12). */
export function chamberTitle(
  anchor: GraphNode,
  profileScope: string,
): string {
  if (profileScope === "bootstrapping" && anchor.entityType === "Archetype") {
    return `${anchor.title} (archetype)`;
  }
  if (profileScope === "migration" && anchor.entityType === "Place") {
    return `${anchor.title} (place of the journey)`;
  }
  return anchor.title;
}
