import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { PalaceCuration } from "@research-canvas/canvas";
import type {
  GraphNode,
  GraphRelationship,
  TimelineView,
  WorkspaceTransport,
} from "@research-canvas/desktop-api";
import type { Scene } from "@research-canvas/schema";

import { usePipelineActions } from "./usePipelineActions";

const NS = "root-archetypal-field";
const bandGenocide = `${NS}:banda-genocide`;
const placeBanda = `${NS}:place-banda-islands`;

function makeGraphNode(
  id: string,
  title: string,
  entityType: string,
  opts: Partial<GraphNode> = {},
): GraphNode {
  return {
    graphNodeId: id,
    entityType: entityType as GraphNode["entityType"],
    title,
    body: "",
    summary: "",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    evidenceTags: [],
    sourceKind: null,
    contentOrigin: null,
    contentRevision: null,
    seedSchemaVersion: null,
    bodySourceCoordinates: [],
    historicity: null,
    claimKind: null,
    evidenceStatus: null,
    temporalRole: null,
    placeCoverage: null,
    place: null,
    qlForm: null,
    qlUnitId: null,
    qlArc: null,
    qlTopology: null,
    qlSchemaVersion: null,
    qlSourceCoordinates: [],
    qlCompletenessStatus: null,
    isTemporal: false,
    validFrom: null,
    validTo: null,
    temporalPrecision: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...opts,
  };
}

interface CallLog {
  kind: string;
  [key: string]: unknown;
}

/** A real fake transport: async methods record their calls and return real
 * fixtures — no vi.fn behaviour stubs for the seams under test. */
function makeFakeTransport(overrides: {
  timelineNodes?: TimelineView["nodes"];
  relationships?: GraphRelationship[];
  curation?: unknown;
}) {
  const calls: CallLog[] = [];
  const bandaEvent = makeGraphNode(bandGenocide, "Banda genocide", "Event", {
    isTemporal: true,
    validFrom: "1621-01-01",
    temporalPrecision: "year",
  });
  const bandaPlace = makeGraphNode(placeBanda, "Banda Islands", "Place");

  const transport = {
    calls,
    async loadTimelineView(): Promise<TimelineView> {
      return {
        workspaceId: "sqlite:/canonical/workspace.sqlite",
        nodes:
          overrides.timelineNodes ?? [
            {
              node: bandaEvent,
              anchor: { validFrom: "1621-01-01", validTo: null, precision: "year" },
              layoutOverride: null,
            },
            {
              node: bandaPlace,
              anchor: { validFrom: "1621-01-01", validTo: null, precision: "year" },
              layoutOverride: null,
              relationCompanion: true,
            },
          ],
        relationships:
          overrides.relationships ?? [
            {
              id: "rel-1",
              relType: "LOCATED_AT",
              sourceGraphNodeId: bandGenocide,
              targetGraphNodeId: placeBanda,
              properties: {},
            },
          ],
        lanes: [],
        diagnostics: [],
      };
    },
    async updateGraphNode(input: Parameters<WorkspaceTransport["updateGraphNode"]>[0]) {
      const { graphNodeId, patch } = input;
      calls.push({ kind: "updateGraphNode", graphNodeId, patch });
      return makeGraphNode(graphNodeId, "Banda genocide", "Event", {
        isTemporal: true,
        validFrom: (patch.validFrom as string) ?? "1621-01-01",
        temporalPrecision: "year",
      });
    },
    async upsertTimelineLayout(
      input: Parameters<WorkspaceTransport["upsertTimelineLayout"]>[0],
    ) {
      calls.push({ kind: "upsertTimelineLayout", ...input });
      return {
        status: "created",
        layout: {
          lane: input.lane,
          offsetY: input.offsetY,
          width: input.width,
          height: input.height,
          style: input.style,
          layoutRevision: 1,
        },
      };
    },
    async connectGraphNodes(
      input: Parameters<WorkspaceTransport["connectGraphNodes"]>[0],
    ) {
      calls.push({ kind: "connectGraphNodes", ...input });
      return {
        id: "rel-2",
        relType: input.relType,
        sourceGraphNodeId: input.sourceGraphNodeId,
        targetGraphNodeId: input.targetGraphNodeId,
        properties: {},
      };
    },
    async loadPalaceCuration(): Promise<{
      profileScope: string;
      curation: unknown;
    }> {
      return {
        profileScope: "bootstrapping",
        curation: overrides.curation ?? null,
      };
    },
    async loadPalaceGraph(input: Parameters<WorkspaceTransport["loadPalaceGraph"]>[0]) {
      return {
        workspaceId: input.workspaceId,
        nodes: [
          {
            node: bandaEvent,
            anchor: { validFrom: "1621-01-01", validTo: null, precision: "year" },
            layoutOverride: null,
          },
          {
            node: bandaPlace,
            anchor: { validFrom: "1621-01-01", validTo: null, precision: "year" },
            layoutOverride: null,
            relationCompanion: true,
          },
        ],
        relationships: overrides.relationships ?? [],
        encapsulationEdges: [],
      };
    },
    async savePalaceCuration(
      input: Parameters<WorkspaceTransport["savePalaceCuration"]>[0],
    ) {
      calls.push({ kind: "savePalaceCuration", curation: input.curation });
      return { profileScope: "bootstrapping", curation: input.curation };
    },
    async upsertScene(input: Parameters<WorkspaceTransport["upsertScene"]>[0]) {
      calls.push({ kind: "upsertScene", scene: input.scene });
      return input.scene;
    },
  } as unknown as WorkspaceTransport;

  return { transport, calls };
}

const node = {
  graphNodeId: bandGenocide,
  title: "Banda genocide",
  canvasNodeType: "note",
  entityType: "Event",
};

const HOOK_ARGS = {
  transport: null as WorkspaceTransport | null,
  workspaceId: "sqlite:/canonical/workspace.sqlite",
  databasePath: "/canonical/workspace.sqlite",
  profileScope: "bootstrapping",
};

describe("usePipelineActions", () => {
  it("sendToTimeline dates the object then places it on the timeline", async () => {
    const { transport, calls } = makeFakeTransport({});
    const onSettled = vi.fn();
    const { result } = renderHook(() =>
      usePipelineActions({ ...HOOK_ARGS, transport, onSettled }),
    );
    await result.current.sendToTimeline(node, "1621");

    const updateCall = calls.find((call) => call.kind === "updateGraphNode");
    expect(updateCall?.graphNodeId).toBe(bandGenocide);
    expect(updateCall?.patch).toMatchObject({
      isTemporal: true,
      validFrom: "1621-01-01",
      temporalPrecision: "year",
    });
    expect(
      calls.some(
        (call) =>
          call.kind === "upsertTimelineLayout" &&
          call.graphNodeId === bandGenocide,
      ),
    ).toBe(true);
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("locate connects the object to a Temporal Place via LOCATED_AT", async () => {
    const { transport, calls } = makeFakeTransport({});
    const { result } = renderHook(() =>
      usePipelineActions({ ...HOOK_ARGS, transport }),
    );
    await result.current.locate(node, placeBanda);

    const connectCall = calls.find((call) => call.kind === "connectGraphNodes");
    expect(connectCall?.relType).toBe("LOCATED_AT");
    expect(connectCall?.sourceGraphNodeId).toBe(bandGenocide);
    expect(connectCall?.targetGraphNodeId).toBe(placeBanda);
  });

  it("addToStory frames the scene from the located place and the object's anchor", async () => {
    const { transport, calls } = makeFakeTransport({});
    const { result } = renderHook(() =>
      usePipelineActions({ ...HOOK_ARGS, transport }),
    );
    await result.current.addToStory(node);

    const sceneCall = calls.find((call) => call.kind === "upsertScene");
    const scene = sceneCall?.scene as Scene;
    expect(scene.id).toBe("pipeline:root-archetypal-field-banda-genocide");
    expect(scene.profileScope).toBe("bootstrapping");
    expect(scene.placeFrame.placeId).toBe(placeBanda);
    expect(scene.placeFrame.validAt).toEqual({ instant: "1621-01-01" });
    expect(scene.timeWindow).toEqual({
      start: "1621-01-01",
      end: "1621-01-01",
    });
    expect(scene.people).toEqual([{ graphNodeId: bandGenocide, role: "subject" }]);
    expect(scene.assembledBy).toBe("human");
  });

  it("placeInPalace derives chambers and places the object as curation, never a graph write", async () => {
    const { transport, calls } = makeFakeTransport({ curation: null });
    const { result } = renderHook(() =>
      usePipelineActions({ ...HOOK_ARGS, transport }),
    );
    await result.current.placeInPalace(node);

    const saveCall = calls.find((call) => call.kind === "savePalaceCuration");
    const curation = saveCall?.curation as PalaceCuration;
    expect(curation.objects).toHaveLength(1);
    expect(curation.objects[0]).toMatchObject({
      objectId: "pipeline:root-archetypal-field-banda-genocide",
      kind: "event",
      graphNodeId: bandGenocide,
      roomId: curation.chambers[0].candidateId,
    });
    // The palace seam must not touch the graph.
    expect(calls.some((call) => call.kind === "connectGraphNodes")).toBe(false);
    expect(calls.some((call) => call.kind === "updateGraphNode")).toBe(false);
  });
});
