// apps/desktop/src/features/pipeline/usePipelineActions.ts
//
// Send-to actions through the real transport seams (task-9 step 3):
//   - "Send to timeline"  → date the object (updateGraphNode) + upsertTimelineLayout
//   - "Locate"            → connect the object to a Temporal Place (LOCATED_AT)
//   - "Add to story"      → create a profile scene (upsertScene)
//   - "Place in palace"   → place an object in a chamber (palace curation)
//
// Every action writes only to the store its seam owns: graph substance for
// dating/locating (Neo4j via the graph repository), scene store for stories,
// palace curation store for placements. The palace placement is curation,
// never a graph write.

import { useCallback } from "react";

import {
  clusterChambers,
  curateChambers,
  placePalaceObject,
  type PalaceCuration,
  type PalaceObjectKind,
} from "@research-canvas/canvas";
import type { WorkspaceTransport } from "@research-canvas/desktop-api";
import type { Scene } from "@research-canvas/schema";

import type { PipelineStageId } from "./pipelineStages";

export interface PipelineObject {
  graphNodeId: string;
  title: string;
  /** Canvas node type ("portal" | "note" | ...) used to pick a palace kind. */
  canvasNodeType?: string;
  /** Canonical entity type when known (from the timeline record). */
  entityType?: string;
}

export interface UsePipelineActionsInput {
  transport: WorkspaceTransport | null;
  workspaceId: string | null;
  databasePath: string | null;
  profileScope: string | null;
  /** Called after an action settles so the stage-state model can re-read stores. */
  onSettled?: () => void;
}

export interface UsePipelineActionsResult {
  sendToTimeline: (node: PipelineObject, year: string) => Promise<void>;
  locate: (node: PipelineObject, placeGraphNodeId: string) => Promise<void>;
  addToStory: (
    node: PipelineObject,
    options?: { placeId?: string; validFrom?: string; validTo?: string },
  ) => Promise<void>;
  placeInPalace: (node: PipelineObject, roomId?: string) => Promise<void>;
}

export function normalizeYear(year: string): string {
  const digits = year.trim().replace(/[^0-9-]/g, "");
  if (!digits || digits === "-") return "1600";
  const numeric = Number(digits);
  if (!Number.isFinite(numeric) || numeric < -9999 || numeric > 9999) return "1600";
  return `${numeric}-01-01`;
}

export function slugifyGraphNodeId(graphNodeId: string): string {
  return graphNodeId.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function palaceKindFor(node: PipelineObject): PalaceObjectKind {
  if (node.entityType === "Constellation" || node.canvasNodeType === "portal") {
    return "compressedConstellation";
  }
  if (node.entityType === "Place") return "place";
  if (node.entityType === "Event") return "event";
  return "storyScene";
}

export function usePipelineActions(
  input: UsePipelineActionsInput,
): UsePipelineActionsResult {
  const { transport, workspaceId, databasePath, profileScope, onSettled } = input;

  const sendToTimeline = useCallback(
    async (node: PipelineObject, year: string) => {
      if (!transport) throw new Error("no transport");
      if (!workspaceId) throw new Error("no workspace");
      const validFrom = normalizeYear(year);
      await transport.updateGraphNode({
        graphNodeId: node.graphNodeId,
        patch: {
          isTemporal: true,
          validFrom,
          temporalPrecision: "year",
        },
      });
      await transport.upsertTimelineLayout({
        workspaceId,
        graphNodeId: node.graphNodeId,
        lane: "default",
        offsetY: 0,
        width: 260,
        height: 150,
        style: {},
        expectedRevision: null,
      });
      onSettled?.();
    },
    [onSettled, transport, workspaceId],
  );

  const locate = useCallback(
    async (node: PipelineObject, placeGraphNodeId: string) => {
      if (!transport) throw new Error("no transport");
      // The flow view gates "Locate" on the object already being on the
      // timeline; re-affirming is_temporal keeps the seam idempotent.
      await transport.updateGraphNode({
        graphNodeId: node.graphNodeId,
        patch: { isTemporal: true },
      });
      await transport.connectGraphNodes({
        sourceGraphNodeId: node.graphNodeId,
        targetGraphNodeId: placeGraphNodeId,
        relType: "LOCATED_AT",
        sourceCoordinates: [],
        evidenceTags: ["pipeline-locate"],
      });
      onSettled?.();
    },
    [onSettled, transport],
  );

  const addToStory = useCallback(
    async (
      node: PipelineObject,
      options: { placeId?: string; validFrom?: string; validTo?: string } = {},
    ) => {
      if (!transport) throw new Error("no transport");
      if (!databasePath) throw new Error("no database");

      // Derive the object's temporal anchor + located place from the real
      // timeline view when the caller did not supply them, so the scene is
      // framed by the same substance the other stages read.
      let placeId = options.placeId ?? "earth";
      let validFrom = options.validFrom ?? "1600-01-01";
      let validTo = options.validTo ?? validFrom;
      if (transport && workspaceId) {
        const view = await transport.loadTimelineView({ workspaceId });
        const record = view.nodes.find(
          (entry) => entry.node.graphNodeId === node.graphNodeId,
        );
        if (record?.anchor) {
          validFrom = options.validFrom ?? record.anchor.validFrom;
          validTo = options.validTo ?? record.anchor.validTo ?? validFrom;
        }
        if (!options.placeId) {
          const nodesById = new Map(
            view.nodes.map((entry) => [entry.node.graphNodeId, entry.node]),
          );
          for (const relationship of view.relationships) {
            if (relationship.relType !== "LOCATED_AT") continue;
            const isSource = relationship.sourceGraphNodeId === node.graphNodeId;
            const isTarget = relationship.targetGraphNodeId === node.graphNodeId;
            if (!isSource && !isTarget) continue;
            const otherId = isSource
              ? relationship.targetGraphNodeId
              : relationship.sourceGraphNodeId;
            const other = nodesById.get(otherId);
            if (other?.entityType === "Place") {
              placeId = other.graphNodeId;
              break;
            }
          }
        }
      }

      const now = new Date().toISOString();
      const scene: Scene = {
        id: `pipeline:${slugifyGraphNodeId(node.graphNodeId)}`,
        profileScope: profileScope ?? "bootstrapping",
        placeFrame: {
          placeId,
          validAt: { instant: validFrom },
        },
        timeWindow: { start: validFrom, end: validTo },
        people: [{ graphNodeId: node.graphNodeId, role: "subject" }],
        passages: [],
        consents: [],
        redactions: [],
        languageVariants: [],
        title: node.title,
        assembledBy: "human",
        curationEvents: [],
        nestedSequenceIds: [],
        createdAt: now,
        updatedAt: now,
      };
      await transport.upsertScene({ databasePath, scene });
      onSettled?.();
    },
    [databasePath, onSettled, profileScope, transport, workspaceId],
  );

  const placeInPalace = useCallback(
    async (node: PipelineObject, roomId?: string) => {
      if (!transport) throw new Error("no transport");
      if (!databasePath) throw new Error("no database");
      if (!workspaceId) throw new Error("no workspace");

      const loaded = await transport.loadPalaceCuration({
        databasePath,
        profileScope: profileScope ?? undefined,
      });
      let curation =
        (loaded.curation as PalaceCuration | null) ?? null;

      // No curation yet: derive the same real chambers the palace lens would
      // (clusterChambers + curateChambers) so the object lands in a real room.
      if (!curation) {
        const view = await transport.loadPalaceGraph({ workspaceId });
        const graphNodes = view.nodes.map((record) => record.node);
        const nodesById = new Map(
          graphNodes.map((node) => [node.graphNodeId, node]),
        );
        const candidates = clusterChambers(graphNodes, view.relationships);
        curation = curateChambers(
          candidates,
          nodesById,
          profileScope ?? "bootstrapping",
        );
      }

      let targetRoom = roomId ?? curation.chambers[0]?.candidateId ?? null;
      if (!targetRoom) {
        curation = {
          ...curation,
          chambers: [
            {
              candidateId: "palace",
              anchorGraphNodeId: node.graphNodeId,
              title: node.title,
              pinned: false,
              excluded: false,
              position: 0,
            },
          ],
        };
        targetRoom = "palace";
      }

      const next = placePalaceObject(curation, {
        objectId: `pipeline:${slugifyGraphNodeId(node.graphNodeId)}`,
        roomId: targetRoom,
        kind: palaceKindFor(node),
        title: node.title,
        graphNodeId: node.graphNodeId,
        contentRef: null,
        placement: {
          surface: "floor",
          position: { x: 0, y: 0, z: 0 },
          rotationY: 0,
          scale: 0.6,
        },
      });

      await transport.savePalaceCuration({
        databasePath,
        profileScope: profileScope ?? undefined,
        curation: next,
      });
      onSettled?.();
    },
    [databasePath, onSettled, profileScope, transport, workspaceId],
  );

  return { sendToTimeline, locate, addToStory, placeInPalace };
}

export type { PipelineStageId };
