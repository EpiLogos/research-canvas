import path from "node:path";

import type { ExportBundle } from "@research-canvas/schema";

export const sampleProjectRoot = path.resolve(
  "tests/fixtures/sample-project"
);

export function createSampleExportBundle(): ExportBundle {
  const projectId = "11111111-1111-4111-8111-111111111111";
  const canvasId = "22222222-2222-4222-8222-222222222222";
  const noteNodeId = "33333333-3333-4333-8333-333333333333";
  const resourceNodeId = "44444444-4444-4444-8444-444444444444";
  const annotationId = "66666666-6666-4666-8666-666666666666";

  return {
    annotations: [
      {
        annotationType: "highlight",
        bounds: {
          position: { x: 80, y: 120 },
          size: { height: 56, width: 240 }
        },
        canvasId,
        createdAt: "2026-03-30T22:00:00Z",
        id: annotationId,
        points: [
          { x: 80, y: 120, pressure: 0.6 },
          { x: 320, y: 176, pressure: 0.7 }
        ],
        style: {
          color: "#f0b45a",
          opacity: 0.25,
          width: 18
        },
        text: "Sequence cue",
        updatedAt: "2026-03-30T22:00:00Z"
      }
    ],
    assets: [
      {
        downloadName: "README.md",
        mimeType: "text/markdown",
        nodeId: resourceNodeId,
        relativePath: "README.md",
        sourcePath: path.join(sampleProjectRoot, "README.md")
      },
      {
        downloadName: "example.png",
        mimeType: "image/png",
        nodeId: resourceNodeId,
        relativePath: "assets/example.png",
        sourcePath: path.join(sampleProjectRoot, "assets/example.png")
      }
    ],
    canvases: [
      {
        createdAt: "2026-03-30T22:00:00Z",
        id: canvasId,
        kind: "primary",
        lastViewport: {
          x: 0,
          y: 0,
          zoom: 1
        },
        name: "Primary canvas",
        projectId,
        updatedAt: "2026-03-30T22:00:00Z"
      }
    ],
    edges: [
      {
        canvasId,
        createdAt: "2026-03-30T22:00:00Z",
        directionality: "forward",
        id: "77777777-7777-4777-8777-777777777777",
        label: "supports",
        note: "Supporting source",
        relationKind: "supports",
        sourceNodeId: noteNodeId,
        sequencePriority: 0,
        sequencing: false,
        style: {
          dashed: false,
          stroke: "#f0b45a",
          width: 2
        },
        targetNodeId: resourceNodeId,
        updatedAt: "2026-03-30T22:00:00Z"
      }
    ],
    generatedAt: "2026-03-30T22:00:00Z",
    nodes: [
      {
        canvasId,
        graphNodeId: null,
        content:
          "# Opening note\n\nThe thesis starts here.\n\n- first supporting point\n- second supporting point",
        createdAt: "2026-03-30T22:00:00Z",
        id: noteNodeId,
        position: { x: 80, y: 80 },
        sequenceCaption: null,
        sequenceViewport: null,
        size: { height: 160, width: 240 },
        summary: "The thesis starts here.",
        tags: ["note"],
        title: "Opening note",
        type: "note",
        updatedAt: "2026-03-30T22:00:00Z"
      },
      {
        absolutePath: path.join(sampleProjectRoot, "README.md"),
        canvasId,
        graphNodeId: null,
        createdAt: "2026-03-30T22:00:00Z",
        fileFingerprint: "file:README.md",
        id: resourceNodeId,
        mimeType: "text/markdown",
        position: { x: 360, y: 80 },
        sequenceCaption: null,
        sequenceViewport: null,
        relativePath: "README.md",
        resourceKind: "markdown",
        size: { height: 180, width: 260 },
        summary: "README.md",
        title: "Project README",
        type: "resource",
        updatedAt: "2026-03-30T22:00:00Z"
      }
    ],
    project: {
      coverAssetPath: null,
      createdAt: "2026-03-30T22:00:00Z",
      displayName: "Sample Project",
      id: projectId,
      parentConstellationId: null,
      primaryCanvasId: canvasId,
      profileScope: "bootstrapping",
      publishSettings: {
        includeResources: true,
        mobileSequenceFirst: true,
        theme: "paper"
      },
      rootPath: sampleProjectRoot,
      rootType: "directory",
      slug: "sample-project",
      summary: "Seed workspace for exporter and viewer flows",
      updatedAt: "2026-03-30T22:00:00Z"
    },
  };
}
