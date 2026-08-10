import type { GraphNode, GraphRelationship } from "@research-canvas/desktop-api";

import { clusterChambers, type ChamberCandidate } from "./clustering";
import {
  curateChambers,
  walkableChambers,
  type PalaceCuration,
  type PalaceObjectKind,
} from "./curation";
import {
  chamberHasQlResonance,
  conjugatePositionForChamber,
  faceForQlPosition,
  qlPositionForNode,
  type QlPosition,
} from "./ql";
import {
  corridorPath,
  faceAnchorPoint,
  hashString,
  layoutForceGraph,
  layoutRoomGrid,
  planarDistance,
  roomSizeFor,
  seededRandom,
  type BoxSize,
  type FaceId,
  type Vec3,
} from "./geometry";
import {
  encapsulationInfo,
  isCompressedConstellationNode,
  type EncapsulationEdgeInput,
  type EncapsulationForm,
} from "./encapsulation";

/**
 * PalaceRenderer — the pure scene-building port of the 3D palace
 * (refinement-2 D5.1, mirroring the Task-2 MapSurfaceRenderer pattern).
 * All layout/geometry logic is pure and unit-tested; the WebGL mount
 * (`PalaceSurface.tsx`) consumes the resulting `PalaceScene` model and is
 * verified by the Playwright e2e asserting real rendered frames.
 *
 * The palace is generated from a real graph: rooms are chamber clusters,
 * paths between rooms are graph edges between chambers, members become
 * placeable objects, wall fixtures derive from graph content, collections
 * derive from graph structure, each chamber hosts a constellation object (its
 * subgraph laid out in 3D), encapsulation shapes rooms and compressed
 * constellations become single palace objects, and the QL 6+6' layer shapes
 * bootstrapping-profile rooms while other profiles get neutral cubes.
 */

export interface PalaceSceneInput {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
  profileScope: string;
  curation: PalaceCuration | null;
  encapsulationEdges: EncapsulationEdgeInput[];
}

export interface PalaceRoomScene {
  id: string;
  title: string;
  anchorGraphNodeId: string;
  center: Vec3;
  size: BoxSize;
  rotationY: number;
  /** `cube` for neutral rooms and full constellations; partial
   * constellations get faithful partial architecture. */
  form: EncapsulationForm | "cube";
  /** Bootstrapping-profile rooms map their six interior faces to P0–P5;
   * other profiles carry `null` (neutral). */
  interiorFaces: Array<{ face: FaceId; qlPosition: QlPosition | null }>;
  exteriorFace: FaceId;
  exteriorConjugate: QlPosition | null;
  members: Array<{
    nodeId: string;
    title: string;
    face: FaceId | "center";
    qlPosition: QlPosition | null;
  }>;
  doorways: FaceId[];
}

export interface PalaceObjectScene {
  id: string;
  roomId: string;
  kind: PalaceObjectKind;
  title: string;
  graphNodeId: string | null;
  contentRef: string | null;
  placement: {
    surface: "floor" | "plinth" | "fixture";
    position: Vec3;
    rotationY: number;
    scale: number;
    face?: FaceId;
  };
  isCurated: boolean;
}

export interface PalaceCollectionScene {
  id: string;
  roomId: string;
  title: string;
  objectIds: string[];
  position: { shelf: number; row: number };
}

export interface ConstellationObjectScene {
  id: string;
  roomId: string;
  title: string;
  nodes: Array<{ id: string; title: string; position: Vec3 }>;
  edges: Array<{ source: string; target: string; relType: string }>;
  center: Vec3;
  scale: number;
}

export interface PalaceConnectionScene {
  id: string;
  fromRoomId: string;
  toRoomId: string;
  path: Array<{ x: number; z: number }>;
}

export interface PalaceScene {
  profileScope: string;
  rooms: PalaceRoomScene[];
  connections: PalaceConnectionScene[];
  objects: PalaceObjectScene[];
  collections: PalaceCollectionScene[];
  constellationObjects: ConstellationObjectScene[];
  entryRoomId: string;
  walkOrder: string[];
  /** id → node title for fly-to labels. */
  nodeTitles: Record<string, string>;
  /** Compressed-constellation palace objects that can be entered/unfolded. */
  encapsulationObjects: Array<{
    objectId: string;
    containerNodeId: string;
    roomId: string;
  }>;
}

const NEUTRAL_FACES: FaceId[] = ["north", "south", "east", "west", "floor", "ceiling"];

export function buildPalaceScene(input: PalaceSceneInput): PalaceScene {
  const { nodes, relationships, profileScope, encapsulationEdges } = input;
  const nodesById = new Map(nodes.map((node) => [node.graphNodeId, node]));
  const candidates = clusterChambers(nodes, relationships);
  const curation =
    input.curation ?? curateChambers(candidates, nodesById, profileScope);
  const walkable = walkableChambers(curation);
  const qlShaped = profileScope === "bootstrapping";

  const grid = layoutRoomGrid(
    Math.max(walkable.length, 1),
    hashString(`palace-grid:${profileScope}`),
  );

  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));

  const rooms: PalaceRoomScene[] = [];
  const roomCenters = new Map<string, Vec3>();
  const roomSizes = new Map<string, BoxSize>();
  const roomExteriorFaces = new Map<string, FaceId>();
  const roomDoorways = new Map<string, FaceId[]>();

  walkable.forEach((chamber, index) => {
    const candidate = candidateById.get(chamber.candidateId);
    const members = (candidate?.memberNodeIds ?? [])
      .map((id) => nodesById.get(id))
      .filter((node): node is GraphNode => Boolean(node));
    const center = grid[index];
    const size = roomSizeFor(chamber.candidateId);
    const anchorInfo = encapsulationInfo(chamber.anchorGraphNodeId, encapsulationEdges);
    const form: EncapsulationForm | "cube" = anchorInfo.isContainer
      ? (anchorInfo.form ?? "cube")
      : "cube";

    // The room's geometry is faithful to its form: a full constellation is a
    // cube room; partial constellations become alcove/corridor/wall-section
    // shapes, never a forced cube.
    const shapedSize = sizeForForm(form, size);

    // The portal faces the neighbour (or the palace entry) so corridors are
    // real paths between rooms.
    const exteriorFace = portalFaceFor(index, grid);

    const interiorFaces = qlShaped
      ? NEUTRAL_FACES.map((face) => ({
          face,
          qlPosition: qlPositionForFace(face),
        }))
      : NEUTRAL_FACES.map((face) => ({ face, qlPosition: null as QlPosition | null }));

    const memberScenes = members.map((member) => {
      let face: FaceId | "center" = "center";
      let qlPosition: QlPosition | null = null;
      if (qlShaped && chamberHasQlResonance(members)) {
        qlPosition = qlPositionForNode({ node: member, members });
        if (qlPosition !== null) face = faceForQlPosition(qlPosition);
      }
      return {
        nodeId: member.graphNodeId,
        title: member.title,
        face,
        qlPosition,
      };
    });

    rooms.push({
      id: chamber.candidateId,
      title: chamber.title,
      anchorGraphNodeId: chamber.anchorGraphNodeId,
      center,
      size: shapedSize,
      rotationY: entryYawForIndex(index),
      form,
      interiorFaces,
      exteriorFace,
      exteriorConjugate: qlShaped
        ? conjugatePositionForChamber(chamber.candidateId)
        : null,
      members: memberScenes,
      doorways: [exteriorFace],
    });
    roomCenters.set(chamber.candidateId, center);
    roomSizes.set(chamber.candidateId, shapedSize);
    roomExteriorFaces.set(chamber.candidateId, exteriorFace);
    roomDoorways.set(chamber.candidateId, [exteriorFace]);
  });

  // Connections = graph edges between chambers (paths between rooms).
  const connections = buildConnections(
    walkable.map((chamber) => chamber.candidateId),
    relationships,
    candidateById,
    roomCenters,
  );

  // Objects: generated defaults overlaid with curated placements.
  const objects = buildObjects(
    nodes,
    walkable,
    candidateById,
    nodesById,
    curation,
    roomCenters,
    roomSizes,
    roomExteriorFaces,
    encapsulationEdges,
  );

  // Collections: derive one per chamber grouping its members (a coherent set),
  // then overlay curated collections.
  const collections = buildCollections(
    walkable,
    candidateById,
    nodesById,
    curation,
    objects,
  );

  // Constellation objects: each chamber hosts its subgraph laid out in 3D.
  const constellationObjects = buildConstellationObjects(
    walkable,
    candidateById,
    nodesById,
    relationships,
    roomCenters,
  );

  const entryRoomId = walkable[0]?.candidateId ?? "";
  const nodeTitles: Record<string, string> = {};
  for (const node of nodes) nodeTitles[node.graphNodeId] = node.title;

  const encapsulationObjects = objects
    .filter((object) => object.kind === "compressedConstellation" && object.graphNodeId)
    .map((object) => ({
      objectId: object.id,
      containerNodeId: object.graphNodeId as string,
      roomId: object.roomId,
    }));

  return {
    profileScope,
    rooms,
    connections,
    objects,
    collections,
    constellationObjects,
    entryRoomId,
    walkOrder: walkable.map((chamber) => chamber.candidateId),
    nodeTitles,
    encapsulationObjects,
  };
}

// ---- helpers ----

function qlPositionForFace(face: FaceId): QlPosition | null {
  switch (face) {
    case "floor":
      return 0;
    case "south":
      return 1;
    case "east":
      return 2;
    case "north":
      return 3;
    case "west":
      return 4;
    case "ceiling":
      return 5;
  }
}

/** Faithful partial architecture: a full constellation keeps a cube; partial
 * shapes distort one axis so the room never reads as a forced cube. */
function sizeForForm(form: EncapsulationForm | "cube", base: BoxSize): BoxSize {
  switch (form) {
    case "alcove":
      // A recessed shelf-like room: shallow depth, full width.
      return { ...base, depth: base.depth * 0.45, height: base.height * 0.9 };
    case "corridor":
      // A passage: narrow and long.
      return { width: base.width * 0.55, depth: base.depth * 1.7, height: base.height };
    case "wallSection":
      // A single wall panel: nearly flat.
      return { width: base.width * 0.8, depth: 0.4, height: base.height * 0.95 };
    default:
      return base;
  }
}

function entryYawForIndex(index: number): number {
  const random = seededRandom(hashString(`room-yaw:${index}`));
  return random() * Math.PI * 2;
}

function portalFaceFor(
  index: number,
  grid: Vec3[],
): FaceId {
  if (index === 0) {
    // Entry room: the portal faces back toward the palace centre (negative z).
    return "north";
  }
  const previous = grid[index - 1];
  const current = grid[index];
  const dx = current.x - previous.x;
  const dz = current.z - previous.z;
  if (Math.abs(dx) >= Math.abs(dz)) {
    return dx > 0 ? "west" : "east";
  }
  return dz > 0 ? "north" : "south";
}

function buildConnections(
  chamberIds: string[],
  relationships: GraphRelationship[],
  candidateById: Map<string, ChamberCandidate>,
  roomCenters: Map<string, Vec3>,
): PalaceConnectionScene[] {
  const idSet = new Set(chamberIds);
  const chamberForNode = new Map<string, string>();
  for (const candidate of candidateById.values()) {
    for (const memberId of candidate.memberNodeIds) {
      chamberForNode.set(memberId, candidate.id);
    }
  }
  const seen = new Set<string>();
  const connections: PalaceConnectionScene[] = [];
  for (const relationship of relationships) {
    const sourceChamber = chamberForNode.get(relationship.sourceGraphNodeId);
    const targetChamber = chamberForNode.get(relationship.targetGraphNodeId);
    if (!sourceChamber || !targetChamber || sourceChamber === targetChamber) continue;
    if (!idSet.has(sourceChamber) || !idSet.has(targetChamber)) continue;
    const key = [sourceChamber, targetChamber].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const from = roomCenters.get(sourceChamber);
    const to = roomCenters.get(targetChamber);
    if (!from || !to) continue;
    connections.push({
      id: `corridor:${key}`,
      fromRoomId: sourceChamber,
      toRoomId: targetChamber,
      path: corridorPath(from, to),
    });
  }
  return connections;
}

function buildObjects(
  nodes: GraphNode[],
  walkable: Array<{ candidateId: string }>,
  candidateById: Map<string, ChamberCandidate>,
  nodesById: Map<string, GraphNode>,
  curation: PalaceCuration,
  roomCenters: Map<string, Vec3>,
  roomSizes: Map<string, BoxSize>,
  roomExteriorFaces: Map<string, FaceId>,
  encapsulationEdges: EncapsulationEdgeInput[],
): PalaceObjectScene[] {
  const curatedByKey = new Map(
    curation.objects.map((placement) => [
      `${placement.roomId}:${placement.objectId}`,
      placement,
    ]),
  );
  const objects: PalaceObjectScene[] = [];
  const nodeTitles: Record<string, string> = {};
  for (const node of nodes) nodeTitles[node.graphNodeId] = node.title;

  for (const chamber of walkable) {
    const candidate = candidateById.get(chamber.candidateId);
    const center = roomCenters.get(chamber.candidateId);
    const size = roomSizes.get(chamber.candidateId);
    if (!candidate || !center || !size) continue;
    const members = candidate.memberNodeIds
      .map((id) => nodesById.get(id))
      .filter((node): node is GraphNode => Boolean(node));

    const faceTotal = new Map<string, number>();

    // Count resonant members per face so slots spread evenly.
    for (const member of members) {
      const face = qlFaceForMember(member, members, nodeTitles);
      const key = typeof face === "string" ? face : "center";
      faceTotal.set(key, (faceTotal.get(key) ?? 0) + 1);
    }
    const slotCursor = new Map<string, number>();

    members.forEach((member) => {
      // A compressed constellation is a member of a parent chamber but is
      // represented by a single palace object (its own id), not a regular
      // member object — the loop below adds that object once.
      if (isCompressedConstellationNode(member.graphNodeId, encapsulationEdges)) {
        return;
      }
      const objectId = `obj:${member.graphNodeId}`;
      const curated = curatedByKey.get(`${chamber.candidateId}:${objectId}`);
      const face = qlFaceForMember(member, members, nodeTitles);
      const faceKey = typeof face === "string" ? face : "center";
      const slot = slotCursor.get(faceKey) ?? 0;
      slotCursor.set(faceKey, slot + 1);
      const total = faceTotal.get(faceKey) ?? 1;
      const kind = objectKindForNode(member);
      let position = curated?.placement.position
        ? curated.placement.position
        : defaultObjectPosition(
            face,
            slot,
            total,
            center,
            size,
            roomExteriorFaces.get(chamber.candidateId) ?? "north",
          );
      // Curated fixtures anchor to a face.
      if (curated && curated.placement.surface === "fixture") {
        position = faceAnchorPoint(
          curated.placement.face ?? "north",
          slot,
          total,
          center,
          size,
        );
      }
      objects.push({
        id: objectId,
        roomId: chamber.candidateId,
        kind,
        title: member.title,
        graphNodeId: member.graphNodeId,
        contentRef: null,
        placement: {
          surface: curated?.placement.surface ?? defaultSurface(face),
          position,
          rotationY: curated?.placement.rotationY ?? entryYawForIndex(slot),
          scale: curated?.placement.scale ?? 0.6,
          face: face === "center" ? undefined : face,
        },
        isCurated: Boolean(curated),
      });
    });

    // Compressed constellations become single palace objects that can be
    // entered to unfold (0/1) and exited to compress (1/0).
    const compressedContainers = nodes.filter((node) =>
      isCompressedConstellationNode(node.graphNodeId, encapsulationEdges) &&
      candidate.memberNodeIds.includes(node.graphNodeId),
    );
    for (const container of compressedContainers) {
      const objectId = `obj:${container.graphNodeId}`;
      const curated = curatedByKey.get(`${chamber.candidateId}:${objectId}`);
      objects.push({
        id: objectId,
        roomId: chamber.candidateId,
        kind: "compressedConstellation",
        title: container.title,
        graphNodeId: container.graphNodeId,
        contentRef: null,
        placement: {
          surface: "plinth",
          position: curated?.placement.position ?? {
            x: center.x,
            y: 0.2,
            z: center.z,
          },
          rotationY: curated?.placement.rotationY ?? 0,
          scale: curated?.placement.scale ?? 1.1,
        },
        isCurated: Boolean(curated),
      });
    }
  }

  // Curated placements that don't correspond to a generated member (e.g. a
  // story scene) still render.
  for (const placement of curation.objects) {
    const exists = objects.some(
      (object) =>
        object.id === placement.objectId && object.roomId === placement.roomId,
    );
    if (exists) continue;
    objects.push({
      id: placement.objectId,
      roomId: placement.roomId,
      kind: placement.kind,
      title: placement.title,
      graphNodeId: placement.graphNodeId,
      contentRef: placement.contentRef,
      placement: placement.placement,
      isCurated: true,
    });
  }

  return objects;
}

function qlFaceForMember(
  member: GraphNode,
  members: GraphNode[],
  _titles: Record<string, string>,
): FaceId | "center" {
  const position = qlPositionForNode({ node: member, members });
  if (position === null) return "center";
  return faceForQlPosition(position);
}

function objectKindForNode(node: GraphNode): PalaceObjectKind {
  switch (node.entityType) {
    case "Event":
      return "event";
    case "Place":
      return "place";
    default:
      return "image";
  }
}

function defaultSurface(face: FaceId | "center"): "floor" | "plinth" | "fixture" {
  return face === "center" ? "floor" : "fixture";
}

function defaultObjectPosition(
  face: FaceId | "center",
  slot: number,
  total: number,
  center: Vec3,
  size: BoxSize,
  _portalFace: FaceId,
): Vec3 {
  if (face === "center") {
    const random = seededRandom(hashString(`center:${center.x}:${center.z}:${slot}`));
    return {
      x: center.x + (random() - 0.5) * size.width * 0.5,
      y: 0.25,
      z: center.z + (random() - 0.5) * size.depth * 0.5,
    };
  }
  return faceAnchorPoint(face, slot, total, center, size);
}

function buildCollections(
  walkable: Array<{ candidateId: string }>,
  candidateById: Map<string, ChamberCandidate>,
  nodesById: Map<string, GraphNode>,
  curation: PalaceCuration,
  objects: PalaceObjectScene[],
): PalaceCollectionScene[] {
  const curatedByRoom = new Map<string, PalaceCuration["collections"]>();
  for (const collection of curation.collections) {
    const list = curatedByRoom.get(collection.roomId) ?? [];
    list.push(collection);
    curatedByRoom.set(collection.roomId, list);
  }

  const collections: PalaceCollectionScene[] = [];
  for (const chamber of walkable) {
    const curated = curatedByRoom.get(chamber.candidateId);
    const candidate = candidateById.get(chamber.candidateId);
    if (!candidate) continue;
    const objectIds = objects
      .filter((object) => object.roomId === chamber.candidateId && object.kind !== "compressedConstellation")
      .map((object) => object.id);
    if (curated && curated.length > 0) {
      for (const collection of curated) {
        collections.push({
          id: collection.collectionId,
          roomId: collection.roomId,
          title: collection.title,
          objectIds: collection.objectIds,
          position: collection.position,
        });
      }
      continue;
    }
    if (objectIds.length === 0) continue;
    // Default collection: a coherent set — the chamber's members grouped by
    // the anchor's entity type (a "real collection" derived from structure).
    const anchor = nodesById.get(candidate.anchorGraphNodeId);
    collections.push({
      id: `collection:${chamber.candidateId}`,
      roomId: chamber.candidateId,
      title: anchor ? `${anchor.title} collection` : "Chamber collection",
      objectIds,
      position: { shelf: 0, row: 0 },
    });
  }
  return collections;
}

function buildConstellationObjects(
  walkable: Array<{ candidateId: string }>,
  candidateById: Map<string, ChamberCandidate>,
  nodesById: Map<string, GraphNode>,
  relationships: GraphRelationship[],
  roomCenters: Map<string, Vec3>,
): ConstellationObjectScene[] {
  const scenes: ConstellationObjectScene[] = [];
  for (const chamber of walkable) {
    const candidate = candidateById.get(chamber.candidateId);
    const center = roomCenters.get(chamber.candidateId);
    if (!candidate || !center) continue;
    const memberIds = new Set(candidate.memberNodeIds);
    const memberNodes = candidate.memberNodeIds
      .map((id) => nodesById.get(id))
      .filter((node): node is GraphNode => Boolean(node));
    if (memberNodes.length < 2) continue;
    const memberEdges = relationships.filter(
      (relationship) =>
        memberIds.has(relationship.sourceGraphNodeId) &&
        memberIds.has(relationship.targetGraphNodeId),
    );
    // Use the scene builder's own force layout (imported below at top-level)
    // so the constellation is laid out from its real edges.
    const layout = layoutConstellationGraph(memberNodes, memberEdges);
    scenes.push({
      id: `constellation:${chamber.candidateId}`,
      roomId: chamber.candidateId,
      title: nodesById.get(candidate.anchorGraphNodeId)?.title ?? chamber.candidateId,
      nodes: layout.map((entry) => ({
        id: entry.node.graphNodeId,
        title: entry.node.title,
        position: entry.position,
      })),
      edges: memberEdges.map((edge) => ({
        source: edge.sourceGraphNodeId,
        target: edge.targetGraphNodeId,
        relType: edge.relType,
      })),
      center,
      scale: 0.8,
    });
  }
  return scenes;
}

function layoutConstellationGraph(
  nodes: GraphNode[],
  edges: GraphRelationship[],
): Array<{ node: GraphNode; position: Vec3 }> {
  const seed = hashString(
    `constellation:${nodes.map((node) => node.graphNodeId).sort().join(",")}`,
  );
  const layout = layoutForceGraph(
    nodes.map((node) => ({ id: node.graphNodeId })),
    edges.map((edge) => ({ source: edge.sourceGraphNodeId, target: edge.targetGraphNodeId })),
    seed,
  );
  const positionById = new Map(layout.map((entry) => [entry.id, entry.position]));
  return nodes.map((node) => ({
    node,
    position:
      positionById.get(node.graphNodeId) ?? { x: 0, y: 0, z: 0 },
  }));
}

/** Re-export for callers that need the underlying layout determinism. */
export function constellationLayoutFor(
  nodes: GraphNode[],
  edges: GraphRelationship[],
): Array<{ node: GraphNode; position: Vec3 }> {
  return layoutConstellationGraph(nodes, edges);
}

export { planarDistance };
