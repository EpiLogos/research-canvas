import { describe, expect, it } from "vitest";
import type { CanvasNode, GraphNodeContract } from "@research-canvas/schema";
import type { LocalNodeDocument } from "@research-canvas/desktop-api";

import {
  readerRecordFromCanvasNode,
  readerRecordFromGraphNode,
  readerRecordWithLocalDocument,
} from "./readerRecord";

const graphNode: GraphNodeContract = {
  graphNodeId: "banda",
  entityType: "Event",
  title: "Banda genocide",
  body: JSON.stringify([
    {
      type: "image",
      props: { url: "assets/banda/ship.png", caption: "Company fleet" },
      content: [],
      children: [],
    },
  ]),
  summary: "A documented Company-state violence event.",
  archetypalResonance: null,
  coordinate: "P3",
  sourceCoordinates: ["episodes/2/colonial-power.md#banda"],
  evidenceTags: ["history:documented", "place:banda-islands"],
  sourceKind: "research",
  contentOrigin: "imported",
  contentRevision: 4,
  seedSchemaVersion: 2,
  bodySourceCoordinates: ["episodes/2/colonial-power.md#banda"],
  historicity: "historical",
  claimKind: "fact",
  evidenceStatus: "documented",
  temporalRole: "occurred_at",
  placeCoverage: "resolved",
  qlForm: null,
  qlUnitId: null,
  qlArc: "not_applicable",
  qlTopology: "unspecified",
  qlSchemaVersion: null,
  qlSourceCoordinates: [],
  qlCompletenessStatus: "not_applicable",
  isTemporal: true,
  validFrom: "1621-01-01",
  validTo: null,
  temporalPrecision: "year",
  createdAt: "2026-07-01T00:00:00Z",
  updatedAt: "2026-07-01T00:00:00Z",
};

describe("reader records", () => {
  it("keeps timeline node substance, provenance, and portable cover media without fabricating a canvas note", () => {
    const record = readerRecordFromGraphNode(graphNode);

    expect(record).toMatchObject({
      kind: "graph",
      graphNodeId: "banda",
      title: "Banda genocide",
      pith: "A documented Company-state violence event.",
      coverReference: "assets/banda/ship.png",
      evidenceTags: ["history:documented", "place:banda-islands"],
      sourceCoordinates: ["episodes/2/colonial-power.md#banda"],
      bodySourceCoordinates: ["episodes/2/colonial-power.md#banda"],
      narrative: {
        historicity: "historical",
        claimKind: "fact",
        evidenceStatus: "documented",
        temporalRole: "occurred_at",
        sourceKind: "research",
      },
      temporal: {
        validFrom: "1621-01-01",
        validTo: null,
        precision: "year",
      },
      placeCoverage: "resolved",
    });
    expect(record.canvasNode).toBeNull();
  });

  it("prefers an explicit canvas cover while retaining canonical graph substance", () => {
    const canvasNode = {
      id: "canvas-banda",
      graphNodeId: "banda",
      graph: graphNode,
      canvasId: "4b0d07f2-dc4e-4ec6-b4f3-69a23b497299",
      type: "note",
      title: "Stale canvas label",
      content: "[]",
      tags: [],
      summary: "Stale canvas pith",
      thumbnail: "assets/banda/cover-curated.png",
      position: { x: 20, y: 20 },
      size: { width: 320, height: 180 },
      sequenceCaption: null,
      sequenceViewport: null,
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-01T00:00:00Z",
    } as CanvasNode;

    const record = readerRecordFromCanvasNode(canvasNode);

    expect(record.title).toBe("Banda genocide");
    expect(record.pith).toBe("A documented Company-state violence event.");
    expect(record.coverReference).toBe("assets/banda/cover-curated.png");
    expect(record.canvasNode).toBe(canvasNode);
  });

  it("overlays only pending document substance without discarding canonical metadata or cover", () => {
    const canvasNode = {
      id: "canvas-banda-pending",
      graphNodeId: "banda",
      graph: graphNode,
      canvasId: "4b0d07f2-dc4e-4ec6-b4f3-69a23b497299",
      type: "note",
      title: "Stale canvas label",
      content: "[]",
      tags: [],
      summary: "Stale canvas pith",
      thumbnail: "assets/banda/cover-curated.png",
      position: { x: 20, y: 20 },
      size: { width: 320, height: 180 },
      sequenceCaption: null,
      sequenceViewport: null,
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-01T00:00:00Z",
    } as CanvasNode;
    const pendingDocument: LocalNodeDocument = {
      graphNodeId: "banda",
      body: '[{"type":"image","props":{"url":"assets/attachments/banda/pending.png"}}]',
      summary: "A local, unpublished reader pith.",
      neo4jSynced: false,
      contentOrigin: "user_authored",
      contentRevision: 5,
      bodySourceCoordinates: ["local#reader-pending"],
    };

    const record = readerRecordWithLocalDocument(
      readerRecordFromCanvasNode(canvasNode),
      pendingDocument,
    );

    expect(record.graphNode).toMatchObject({
      graphNodeId: "banda",
      entityType: "Event",
      title: "Banda genocide",
      body: pendingDocument.body,
      summary: pendingDocument.summary,
      contentOrigin: "user_authored",
      contentRevision: 5,
      bodySourceCoordinates: ["local#reader-pending"],
      evidenceTags: ["history:documented", "place:banda-islands"],
    });
    expect(record.coverReference).toBe("assets/banda/cover-curated.png");
    expect(record.canvasNode).toBe(canvasNode);
    expect(record.placeTags).toEqual(["place:banda-islands"]);
    expect(record.temporal).toEqual({ validFrom: "1621-01-01", validTo: null, precision: "year" });
  });
});
