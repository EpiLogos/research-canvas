import { describe, expect, it } from "vitest";

import {
  annotationSchema,
  edgeSchema,
  exportBundleSchema,
  noteNodeSchema,
  projectSchema,
  resourceNodeSchema,
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

  it("accepts nullable node style fields and nullable edge handles from persisted payloads", () => {
    const node = resourceNodeSchema.parse({
      id: "f83d047c-9fca-4dfe-b8d6-3f763e20da1b",
      canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f",
      type: "resource",
      title: "README.md",
      position: { x: 320, y: 180 },
      size: { width: 320, height: 240 },
      summary: "Working summary",
      resourceKind: "markdown",
      absolutePath: "/tmp/README.md",
      relativePath: "README.md",
      mimeType: "text/markdown",
      fileFingerprint: "markdown:README.md",
      dotColour: null,
      bgColour: null,
      textColour: null,
      thumbnail: null,
      url: null,
      createdAt: now,
      updatedAt: now
    });

    const edge = edgeSchema.parse({
      id: "d225ce1d-cac5-472d-9230-9a403b8b29bb",
      canvasId: "4204b10c-26f9-4280-8e7c-878eaed29e4f",
      sourceNodeId: "d44a3b4a-22ad-4086-8c6b-d7d767d5fe12",
      targetNodeId: "e2fb2674-b4a7-4261-8f17-9ff8d1e1a6fe",
      sourceHandleId: null,
      targetHandleId: null,
      relationKind: "supports",
      directionality: "forward",
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

    expect(node.dotColour).toBeUndefined();
    expect(edge.sourceHandleId).toBeUndefined();
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

  it("validates edge with sequencing fields", () => {
    const edge = edgeSchema.parse({
      id: crypto.randomUUID(),
      canvasId: crypto.randomUUID(),
      sourceNodeId: crypto.randomUUID(),
      targetNodeId: crypto.randomUUID(),
      relationKind: "causes",
      directionality: "forward",
      label: "causes",
      note: "",
      style: { stroke: "#f0b45a", width: 2, dashed: false },
      sequencing: true,
      sequencePriority: 10,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(edge.sequencing).toBe(true);
    expect(edge.sequencePriority).toBe(10);
  });

  it("edge sequencing defaults to false and priority to 0", () => {
    const edge = edgeSchema.parse({
      id: crypto.randomUUID(),
      canvasId: crypto.randomUUID(),
      sourceNodeId: crypto.randomUUID(),
      targetNodeId: crypto.randomUUID(),
      relationKind: "reference",
      directionality: "forward",
      label: "ref",
      note: "",
      style: { stroke: "#f0b45a", width: 2, dashed: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(edge.sequencing).toBe(false);
    expect(edge.sequencePriority).toBe(0);
  });

  it("validates node with optional sequence caption and viewport", () => {
    const node = noteNodeSchema.parse({
      id: crypto.randomUUID(),
      canvasId: crypto.randomUUID(),
      type: "note",
      title: "Test",
      position: { x: 0, y: 0 },
      size: { width: 200, height: 150 },
      content: "hello",
      tags: [],
      sequenceCaption: "This is the opening shot",
      sequenceViewport: { x: 100, y: 200, zoom: 1.5 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(node.sequenceCaption).toBe("This is the opening shot");
    expect(node.sequenceViewport).toEqual({ x: 100, y: 200, zoom: 1.5 });
  });

  it("node sequence fields default to null when omitted", () => {
    const node = noteNodeSchema.parse({
      id: crypto.randomUUID(),
      canvasId: crypto.randomUUID(),
      type: "note",
      title: "Test",
      position: { x: 0, y: 0 },
      size: { width: 200, height: 150 },
      content: "hello",
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    expect(node.sequenceCaption).toBeNull();
    expect(node.sequenceViewport).toBeNull();
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
  });
});
