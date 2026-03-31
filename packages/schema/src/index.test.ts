import { describe, expect, it } from "vitest";

import {
  annotationSchema,
  edgeSchema,
  exportBundleSchema,
  noteNodeSchema,
  projectSchema,
  sequenceSchema,
  sequenceStepSchema
} from "./index";

const now = "2026-03-30T20:00:00.000Z";

describe("schema package", () => {
  it("validates a project with publish settings", () => {
    const parsed = projectSchema.parse({
      id: "2a2edca9-e4af-4b2d-b1aa-7353f2bb20f4",
      displayName: "Episode 0.2",
      slug: "episode-0-2",
      parentProjectId: null,
      rootPath: "/tmp/episode-0-2",
      primaryCanvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f",
      summary: "Research-driven pilot episode.",
      coverAssetPath: null,
      publishSettings: {
        includeResources: true,
        mobileSequenceFirst: true,
        theme: "ledger"
      },
      createdAt: now,
      updatedAt: now
    });

    expect(parsed.publishSettings.theme).toBe("ledger");
  });

  it("rejects invalid edge directionality", () => {
    const result = edgeSchema.safeParse({
      id: "d225ce1d-cac5-472d-9230-9a403b8b29bb",
      canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f",
      sourceNodeId: "d44a3b4a-22ad-4086-8c6b-d7d767d5fe12",
      targetNodeId: "e2fb2674-b4a7-4261-8f17-9ff8d1e1a6fe",
      relationKind: "supports",
      directionality: "left",
      label: "Supports thesis",
      note: "The report establishes the premise.",
      style: {
        stroke: "#1f2937",
        width: 2,
        dashed: false
      },
      createdAt: now,
      updatedAt: now
    });

    expect(result.success).toBe(false);
  });

  it("serializes a note node with tags", () => {
    const parsed = noteNodeSchema.parse({
      id: "f83d047c-9fca-4dfe-b8d6-3f763e20da1a",
      canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f",
      type: "note",
      title: "Thesis draft",
      position: { x: 320, y: 180 },
      size: { width: 320, height: 240 },
      summary: "Working summary",
      content: "The central thesis lives here.",
      tags: ["episode", "thesis"],
      createdAt: now,
      updatedAt: now
    });

    expect(parsed.type).toBe("note");
    expect(parsed.tags).toContain("thesis");
  });

  it("validates annotation points with bounds", () => {
    const parsed = annotationSchema.parse({
      id: "f4d1ff01-e7da-456b-b7c7-4db776822d4f",
      canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f",
      annotationType: "stroke",
      points: [
        { x: 0, y: 0, pressure: 0.5 },
        { x: 20, y: 30, pressure: 0.7 }
      ],
      style: {
        color: "#f97316",
        width: 4,
        opacity: 0.8
      },
      bounds: {
        position: { x: 0, y: 0 },
        size: { width: 20, height: 30 }
      },
      createdAt: now,
      updatedAt: now
    });

    expect(parsed.points).toHaveLength(2);
  });

  it("validates sequence and step payloads for guided traversal", () => {
    const sequence = sequenceSchema.parse({
      id: "23705ca7-95f7-43f6-9a89-9262d493b7ca",
      projectId: "2a2edca9-e4af-4b2d-b1aa-7353f2bb20f4",
      canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f",
      name: "Episode flow",
      kind: "presentation",
      description: "Core traversal for the public companion",
      published: true,
      createdAt: now,
      updatedAt: now
    });

    const step = sequenceStepSchema.parse({
      id: "0f0e278c-ee50-4ea0-a057-4660dd32e70a",
      sequenceId: sequence.id,
      position: 0,
      targetType: "node",
      targetId: "f83d047c-9fca-4dfe-b8d6-3f763e20da1a",
      caption: "Open on the thesis note.",
      viewport: {
        x: 120,
        y: 80,
        zoom: 1.1
      },
      transitionHint: "ease"
    });

    expect(step.sequenceId).toBe(sequence.id);
  });

  it("validates export bundle payloads with nested graph data", () => {
    const bundle = exportBundleSchema.parse({
      generatedAt: now,
      project: {
        id: "2a2edca9-e4af-4b2d-b1aa-7353f2bb20f4",
        displayName: "Episode 0.2",
        slug: "episode-0-2",
        parentProjectId: null,
        rootPath: "/tmp/episode-0-2",
        primaryCanvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f",
        summary: "Research-driven pilot episode.",
        coverAssetPath: null,
        publishSettings: {
          includeResources: true,
          mobileSequenceFirst: true,
          theme: "ledger"
        },
        createdAt: now,
        updatedAt: now
      },
      canvases: [
        {
          id: "4204b10c-26f9-4280-8e7c-878eaed29e4f",
          projectId: "2a2edca9-e4af-4b2d-b1aa-7353f2bb20f4",
          name: "Primary canvas",
          kind: "primary",
          createdAt: now,
          updatedAt: now,
          lastViewport: {
            x: 24,
            y: -16,
            zoom: 1.25
          }
        }
      ],
      nodes: [
        {
          id: "f83d047c-9fca-4dfe-b8d6-3f763e20da1a",
          canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f",
          type: "note",
          title: "Thesis draft",
          position: { x: 320, y: 180 },
          size: { width: 320, height: 240 },
          summary: "Working summary",
          content: "The central thesis lives here.",
          tags: ["episode", "thesis"],
          createdAt: now,
          updatedAt: now
        }
      ],
      edges: [],
      sequences: [
        {
          id: "23705ca7-95f7-43f6-9a89-9262d493b7ca",
          projectId: "2a2edca9-e4af-4b2d-b1aa-7353f2bb20f4",
          canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f",
          name: "Episode flow",
          kind: "presentation",
          description: "Core traversal for the public companion",
          published: true,
          createdAt: now,
          updatedAt: now
        }
      ],
      sequenceSteps: [
        {
          id: "0f0e278c-ee50-4ea0-a057-4660dd32e70a",
          sequenceId: "23705ca7-95f7-43f6-9a89-9262d493b7ca",
          position: 0,
          targetType: "node",
          targetId: "f83d047c-9fca-4dfe-b8d6-3f763e20da1a",
          caption: "Open on the thesis note.",
          viewport: {
            x: 120,
            y: 80,
            zoom: 1.1
          },
          transitionHint: "ease"
        }
      ],
      annotations: [
        {
          id: "f4d1ff01-e7da-456b-b7c7-4db776822d4f",
          canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f",
          annotationType: "stroke",
          points: [
            { x: 0, y: 0, pressure: 0.5 },
            { x: 20, y: 30, pressure: 0.7 }
          ],
          style: {
            color: "#f97316",
            width: 4,
            opacity: 0.8
          },
          bounds: {
            position: { x: 0, y: 0 },
            size: { width: 20, height: 30 }
          },
          createdAt: now,
          updatedAt: now
        }
      ]
    });

    expect(bundle.nodes).toHaveLength(1);
    expect(bundle.sequenceSteps[0].transitionHint).toBe("ease");
  });
});
