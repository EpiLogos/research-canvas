import {
  buildPalaceScene,
  clusterChambers,
  curateChambers,
  encapsulationEdgesFromRelationships,
  palaceLayoutFromScene,
  type PalaceCuration,
  type PalaceScene,
} from "@research-canvas/canvas";
import type {
  PalaceBundleWriteResult,
  PalaceLayout,
  PalaceRepository,
} from "@research-canvas/domain";
import type {
  GraphNode,
  GraphRelationship,
  WorkspaceServices,
} from "@research-canvas/desktop-api";
import type { Scene, SceneSequence } from "@research-canvas/schema";

const STORAGE_VERSION = "palace-layout-v1" as const;

interface StoredPalaceEnvelope {
  version: typeof STORAGE_VERSION;
  constellationId: string;
  curation: PalaceCuration;
  layout: PalaceLayout;
}

export interface PalaceProjection {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
  encapsulationEdges: GraphRelationship[];
  curation: PalaceCuration;
  generatedScene: PalaceScene;
  layout: PalaceLayout;
}

/** Desktop repository for Surface #5 graph projection and local presentation persistence. */
export class DesktopPalaceRepository implements PalaceRepository {
  constructor(
    private readonly transport: WorkspaceServices,
    private readonly databasePath: string,
    private readonly workspaceId: string,
    private readonly profileScope: string,
  ) {}

  async getOrCreatePalace(constellationId: string): Promise<PalaceLayout> {
    const projection = await this.getProjection(constellationId);
    const stored = await this.readScopedEnvelope(constellationId);
    if (!stored) await this.writeEnvelope(constellationId, projection.curation, projection.layout);
    return projection.layout;
  }

  async updatePalace(constellationId: string, layout: PalaceLayout): Promise<void> {
    this.assertConstellation(constellationId, layout);
    const projection = await this.getProjection(constellationId);
    await this.writeEnvelope(constellationId, projection.curation, layout);
  }

  async persistWalk({ sequence, scenes }: { sequence: SceneSequence; scenes: Scene[] }): Promise<void> {
    for (const scene of scenes) {
      await this.transport.upsertScene({ databasePath: this.databasePath, scene });
    }
    await this.transport.upsertSceneSequence({ databasePath: this.databasePath, sequence });
  }

  async writeBundle(input: { outputDir: string; bundleJson: string }): Promise<PalaceBundleWriteResult> {
    return this.transport.writePalaceBundle(input);
  }

  async saveCuration(
    constellationId: string,
    curation: PalaceCuration,
    layout: PalaceLayout,
  ): Promise<void> {
    this.assertConstellation(constellationId, layout);
    await this.writeEnvelope(constellationId, curation, layout);
  }

  async getProjection(constellationId: string): Promise<PalaceProjection> {
    if (!constellationId.trim()) throw new Error("Palace constellationId must not be empty");

    const [document, graph, scopedEnvelope, legacy] = await Promise.all([
      this.transport.loadConstellationDocument({ databasePath: this.databasePath, constellationId }),
      this.transport.loadPalaceGraph({ workspaceId: this.workspaceId }),
      this.readScopedEnvelope(constellationId),
      this.transport.loadPalaceCuration({ databasePath: this.databasePath, profileScope: this.profileScope }),
    ]);

    const constellationNodeIds = new Set(document.nodes.map((node) => {
      const candidate = node as unknown as { id: string; graphNodeId?: string | null; graph?: GraphNode | null };
      return candidate.graphNodeId ?? candidate.graph?.graphNodeId ?? candidate.id;
    }));
    const graphNodes = graph.nodes.map((record) => record.node);
    const resolvedConstellationNodes = graphNodes.filter((node) => constellationNodeIds.has(node.graphNodeId));
    const unresolvedMaterialisedConstellation = document.nodes.length > 0
      && resolvedConstellationNodes.length === 0
      && graphNodes.length > 0;
    const nodes = unresolvedMaterialisedConstellation ? graphNodes : resolvedConstellationNodes;
    const includedNodeIds = new Set(nodes.map((node) => node.graphNodeId));
    const relationships = graph.relationships.filter((relationship) =>
      includedNodeIds.has(relationship.sourceGraphNodeId)
      && includedNodeIds.has(relationship.targetGraphNodeId));
    const encapsulationEdges = graph.encapsulationEdges.filter((relationship) =>
      includedNodeIds.has(relationship.sourceGraphNodeId)
      && includedNodeIds.has(relationship.targetGraphNodeId));

    const nodesById = new Map(nodes.map((node) => [node.graphNodeId, node] as const));
    const derivedCuration = curateChambers(clusterChambers(nodes, relationships), nodesById, this.profileScope);
    const legacyCuration = isPalaceCuration(legacy.curation) ? legacy.curation : null;
    const curation = scopedEnvelope?.curation ?? legacyCuration ?? derivedCuration;
    const generatedScene = buildPalaceScene({
      nodes,
      relationships,
      profileScope: this.profileScope,
      curation,
      encapsulationEdges: encapsulationEdgesFromRelationships(encapsulationEdges),
    });
    const layout = scopedEnvelope?.layout ?? palaceLayoutFromScene(constellationId, generatedScene);
    return { nodes, relationships, encapsulationEdges, curation, generatedScene, layout };
  }

  private async readScopedEnvelope(constellationId: string): Promise<StoredPalaceEnvelope | null> {
    const stored = await this.transport.loadPalaceCuration({
      databasePath: this.databasePath,
      profileScope: storageScope(this.profileScope, constellationId),
    });
    return isStoredEnvelope(stored.curation, constellationId) ? stored.curation : null;
  }

  private async writeEnvelope(
    constellationId: string,
    curation: PalaceCuration,
    layout: PalaceLayout,
  ): Promise<void> {
    const envelope: StoredPalaceEnvelope = { version: STORAGE_VERSION, constellationId, curation, layout };
    await this.transport.savePalaceCuration({
      databasePath: this.databasePath,
      profileScope: storageScope(this.profileScope, constellationId),
      curation: envelope,
    });
  }

  private assertConstellation(constellationId: string, layout: PalaceLayout): void {
    if (!constellationId.trim()) throw new Error("Palace constellationId must not be empty");
    if (layout.constellationId !== constellationId) {
      throw new Error(`Palace layout constellation mismatch: expected ${constellationId}, got ${layout.constellationId}`);
    }
  }
}

function storageScope(profileScope: string, constellationId: string): string {
  return `${profileScope}:palace:${encodeURIComponent(constellationId)}`;
}

function isStoredEnvelope(value: unknown, constellationId: string): value is StoredPalaceEnvelope {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredPalaceEnvelope>;
  return candidate.version === STORAGE_VERSION
    && candidate.constellationId === constellationId
    && isPalaceCuration(candidate.curation)
    && Boolean(candidate.layout && candidate.layout.constellationId === constellationId);
}

function isPalaceCuration(value: unknown): value is PalaceCuration {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PalaceCuration>;
  return Array.isArray(candidate.chambers)
    && Array.isArray(candidate.objects)
    && Array.isArray(candidate.fixtures)
    && Array.isArray(candidate.collections);
}
