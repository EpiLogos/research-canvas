import type { GraphNode, GraphRelationship } from "@research-canvas/desktop-api";

/**
 * Encapsulation objectification (refinement-2 §4.6, ticket #27): encapsulation
 * level determines palace form. The `ENCAPSULATES` substrate relation (Task 6)
 * is the data source; the palace reads it through the repository layer. A full
 * 4+2 constellation → a room; a partial constellation → partial architecture
 * faithful to the actual shape (alcove, corridor, wall section — never forced
 * into a cube); a compressed constellation (a node) → a single palace object
 * that can be entered to unfold (0/1, bimba) and exited to compress (1/0,
 * pratibimba) back. The room-as-object is this mechanism enacted spatially.
 */

export type EncapsulationForm =
  | "room"
  | "alcove"
  | "corridor"
  | "wallSection"
  | "singleObject";

export interface EncapsulationEdgeInput {
  containerGraphNodeId: string;
  memberGraphNodeId: string;
  mode: "outgoing" | "ingoing";
}

export interface EncapsulationInfo {
  isContainer: boolean;
  /** The palace form of the container's internal space, when `isContainer`. */
  form: EncapsulationForm | null;
  memberCount: number;
  memberIds: string[];
}

export const ENCAPSULATES_REL_TYPE = "ENCAPSULATES";

export function isEncapsulationEdge(
  relationship: GraphRelationship,
): relationship is GraphRelationship & {
  properties: { mode?: string };
} {
  return relationship.relType === ENCAPSULATES_REL_TYPE;
}

/** Convert a raw GraphRelationship into the palace's encapsulation edge view. */
export function toEncapsulationEdge(
  relationship: GraphRelationship,
): EncapsulationEdgeInput | null {
  if (!isEncapsulationEdge(relationship)) return null;
  const mode = relationship.properties?.mode;
  if (mode !== "outgoing" && mode !== "ingoing") return null;
  return {
    containerGraphNodeId: relationship.sourceGraphNodeId,
    memberGraphNodeId: relationship.targetGraphNodeId,
    mode,
  };
}

export function encapsulationEdgesFromRelationships(
  relationships: GraphRelationship[],
): EncapsulationEdgeInput[] {
  const out: EncapsulationEdgeInput[] = [];
  for (const relationship of relationships) {
    const edge = toEncapsulationEdge(relationship);
    if (edge) out.push(edge);
  }
  return out;
}

/**
 * Classify a node against the encapsulation edges. `outgoing` edges (0/1,
 * bimba) mark a container: the node unfolds into its constellation. The palace
 * form follows the member count — full 4+2 (six members) becomes a room,
 * partial constellations become faithful partial architecture, never a forced
 * cube.
 */
export function encapsulationInfo(
  nodeId: string,
  edges: EncapsulationEdgeInput[],
): EncapsulationInfo {
  const memberIds = edges
    .filter(
      (edge) =>
        edge.containerGraphNodeId === nodeId && edge.mode === "outgoing",
    )
    .map((edge) => edge.memberGraphNodeId);
  if (memberIds.length === 0) {
    return {
      isContainer: false,
      form: null,
      memberCount: 0,
      memberIds: [],
    };
  }
  const uniqueMembers = [...new Set(memberIds)];
  let form: EncapsulationForm;
  if (uniqueMembers.length >= 6) {
    form = "room";
  } else if (uniqueMembers.length >= 4) {
    form = "alcove";
  } else if (uniqueMembers.length >= 2) {
    form = "corridor";
  } else {
    form = "wallSection";
  }
  return {
    isContainer: true,
    form,
    memberCount: uniqueMembers.length,
    memberIds: uniqueMembers,
  };
}

export interface InternalConstellation {
  container: GraphNode;
  members: GraphNode[];
  /** Real graph edges among the internal members (the embodied graph). */
  memberEdges: GraphRelationship[];
  /** Whether this container is itself encapsulated by a parent (a node seen
   * from outside is a single palace object). */
  isCompressed: boolean;
}

/**
 * Unfold a container constellation (0/1, bimba): returns its internal member
 * nodes and the real graph edges among them, with data intact (members keep
 * their full GraphNode substance). Pure over loaded data — the graph store
 * already guarantees acyclicity for ENCAPSULATES.
 */
export function unfoldConstellation(
  containerNodeId: string,
  nodes: GraphNode[],
  relationships: GraphRelationship[],
  encapsulationEdges: EncapsulationEdgeInput[],
): InternalConstellation | null {
  const container = nodes.find((node) => node.graphNodeId === containerNodeId);
  if (!container) return null;
  const info = encapsulationInfo(containerNodeId, encapsulationEdges);
  if (!info.isContainer) return null;
  const memberSet = new Set(info.memberIds);
  const members = nodes.filter((node) => memberSet.has(node.graphNodeId));
  const memberEdges = relationships.filter(
    (relationship) =>
      memberSet.has(relationship.sourceGraphNodeId) &&
      memberSet.has(relationship.targetGraphNodeId),
  );
  const isCompressed = encapsulationEdges.some(
    (edge) =>
      edge.memberGraphNodeId === containerNodeId && edge.mode === "ingoing",
  );
  return {
    container,
    members,
    memberEdges,
    isCompressed,
  };
}

/**
 * Compress an internal constellation back to a single object (1/0,
 * pratibimba): the container node, which remains in the graph with its full
 * substance. This is the exact inverse of `unfoldConstellation`.
 */
export function compressToObject(internal: InternalConstellation): {
  objectNode: GraphNode;
  memberIds: string[];
} {
  return {
    objectNode: internal.container,
    memberIds: internal.members.map((member) => member.graphNodeId),
  };
}

/** True when the node is itself encapsulated by some parent container (it
 * presents as a single palace object in the parent's room). */
export function isCompressedConstellationNode(
  nodeId: string,
  edges: EncapsulationEdgeInput[],
): boolean {
  return edges.some(
    (edge) => edge.memberGraphNodeId === nodeId && edge.mode === "ingoing",
  );
}
