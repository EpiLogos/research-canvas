import { describe, expect, test } from "vitest";

import type { CanvasNode, GraphNodeContract } from "@research-canvas/schema";
import { resolveKnowledgeCardPresentation } from "./cardPresentation";

const graph = (overrides: Partial<GraphNodeContract> = {}): GraphNodeContract => ({
  graphNodeId: "event-banda",
  entityType: "Event",
  title: "Banda Genocide",
  body: "[]",
  summary: "A documented 1621 massacre through which the VOC imposed monopoly power.",
  archetypalResonance: null,
  coordinate: null,
  sourceCoordinates: [],
  evidenceTags: ["documented", "colonialism", "ql-unit"],
  sourceKind: null,
  contentOrigin: "seed",
  contentRevision: 1,
  seedSchemaVersion: 1,
  bodySourceCoordinates: [],
  historicity: "historical",
  claimKind: "fact",
  evidenceStatus: "documented",
  temporalRole: "occurred_at",
  placeCoverage: "resolved",
  qlForm: null,
  qlUnitId: null,
  qlArc: null,
  qlTopology: null,
  qlSchemaVersion: null,
  qlSourceCoordinates: [],
  qlCompletenessStatus: null,
  isTemporal: true,
  validFrom: "1621-01-01",
  validTo: null,
  temporalPrecision: "year",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...overrides,
});

const canvasNode = (overrides: Partial<CanvasNode> = {}): CanvasNode => ({
  id: "event-banda",
  graphNodeId: "event-banda",
  canvasId: "11111111-1111-4111-8111-111111111111",
  type: "note",
  title: "Wrong legacy title",
  content: "Internal seed summary that must never become the card headline.",
  tags: ["legacy-tag"],
  summary: "Legacy summary",
  position: { x: 0, y: 0 },
  size: { width: 280, height: 160 },
  sequenceCaption: null,
  sequenceViewport: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...overrides,
} as CanvasNode);

describe("resolveKnowledgeCardPresentation", () => {
  test("uses the canonical title and pith instead of raw canvas note content", () => {
    const presentation = resolveKnowledgeCardPresentation(canvasNode(), graph());

    expect(presentation.title).toBe("Banda Genocide");
    expect(presentation.pith).toBe("A documented 1621 massacre through which the VOC imposed monopoly power.");
    expect(presentation.tags).toEqual(["documented", "colonialism"]);
    expect(presentation.tags).not.toContain("legacy-tag");
  });

  test("derives a documented historical palette while honouring an explicit canvas accent override", () => {
    const presentation = resolveKnowledgeCardPresentation(
      canvasNode({ dotColour: "#abcdef" }),
      graph(),
    );

    expect(presentation.palette.id).toBe("historical-event");
    expect(presentation.palette.accent).toBe("#abcdef");
    expect(presentation.badges).toEqual(expect.arrayContaining(["Historical", "1621", "Place resolved"]));
  });

  test("surfaces a canonical geographic tag alongside the temporal record", () => {
    const presentation = resolveKnowledgeCardPresentation(
      canvasNode(),
      graph({ evidenceTags: ["documented", "place:banda-islands-indonesia"] }),
    );

    expect(presentation.badges).toContain("Banda Islands Indonesia");
  });

  test("keeps contested claims visually and semantically distinct from verified events", () => {
    const presentation = resolveKnowledgeCardPresentation(
      canvasNode(),
      graph({
        entityType: "Claim",
        title: "Balfour hidden-hand interpretations",
        evidenceTags: ["contested"],
        historicity: "mixed",
        claimKind: "allegation",
        evidenceStatus: "contested",
      }),
    );

    expect(presentation.palette.id).toBe("speculation-contested");
    expect(presentation.badges).toEqual(expect.arrayContaining(["Contested", "Allegation"]));
  });

  test("keeps the reader usable for an incomplete legacy node while hydration is in flight", () => {
    const presentation = resolveKnowledgeCardPresentation(
      { title: "Legacy node" } as CanvasNode,
      undefined,
    );

    expect(presentation.title).toBe("Legacy node");
    expect(presentation.pith).toBe("");
  });
});
