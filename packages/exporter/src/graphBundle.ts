import { z } from "zod";

import { graphNodeSchema, projectSchema } from "@research-canvas/schema";
import type { ExportAsset } from "@research-canvas/schema";
import type {
  CanvasNodeSidecar,
  EdgeLayout,
  GraphExportBundle,
  GraphRelationship,
  LitInstance,
  NodeLayout
} from "@research-canvas/desktop-api";

export type { GraphExportBundle } from "@research-canvas/desktop-api";

const graphRelationshipSchema: z.ZodType<GraphRelationship> = z.object({
  id: z.string().min(1),
  relType: z.string().min(1),
  sourceGraphNodeId: z.string().min(1),
  targetGraphNodeId: z.string().min(1),
  properties: z.record(z.string(), z.unknown())
});

const canvasNodeSidecarSchema: z.ZodType<CanvasNodeSidecar> = z.union([
  z.object({
    type: z.literal("note"),
    title: z.string(),
    content: z.string(),
    tags: z.array(z.string())
  }),
  z.object({
    type: z.literal("resource"),
    title: z.string(),
    resourceKind: z.string(),
    absolutePath: z.string(),
    relativePath: z.string(),
    mimeType: z.string(),
    fileFingerprint: z.string()
  }),
  z.object({
    type: z.literal("group"),
    title: z.string(),
    color: z.string(),
    childNodeIds: z.array(z.string())
  }),
  z.object({
    type: z.literal("portal"),
    title: z.string(),
    targetCanvasId: z.string(),
    constellationKind: z.enum(["standard", "ql-unit"]).optional()
  })
]);

const nodeLayoutSchema: z.ZodType<NodeLayout> = z.object({
  graphNodeId: z.string().min(1),
  canvasId: z.string().min(1),
  positionX: z.number(),
  positionY: z.number(),
  width: z.number(),
  height: z.number(),
  style: z.object({
    dotColour: z.string().optional(),
    bgColour: z.string().optional(),
    textColour: z.string().optional(),
    thumbnail: z.string().optional(),
    __canvasNode: canvasNodeSidecarSchema.optional()
  })
});

const edgeLayoutSchema: z.ZodType<EdgeLayout> = z.object({
  id: z.string().min(1),
  canvasId: z.string().min(1),
  sourceGraphNodeId: z.string().min(1),
  targetGraphNodeId: z.string().min(1),
  relationKind: z.string(),
  sourceHandleId: z.string().optional(),
  targetHandleId: z.string().optional(),
  style: z.object({
    stroke: z.string().optional(),
    width: z.number().optional(),
    dashed: z.boolean().optional()
  })
});

const litInstanceSchema: z.ZodType<LitInstance> = z.object({
  node: graphNodeSchema,
  relType: z.enum(["INSTANTIATES", "ECHOES", "RESONATES_WITH"]),
  dominance: z.enum(["dominant", "secondary"]).nullable()
});

const exportAssetSchema: z.ZodType<ExportAsset> = z.object({
  nodeId: z.string(),
  sourcePath: z.string().min(1),
  relativePath: z.string().min(1),
  downloadName: z.string().min(1),
  mimeType: z.string().min(1)
});

export const graphExportBundleSchema: z.ZodType<GraphExportBundle> = z.object({
  generatedAt: z.string(),
  project: projectSchema,
  canvasId: z.string().min(1),
  nodes: z.array(graphNodeSchema),
  relationships: z.array(graphRelationshipSchema),
  nodeLayout: z.array(nodeLayoutSchema),
  edgeLayout: z.array(edgeLayoutSchema),
  viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number() }),
  appState: z.record(z.string(), z.unknown()),
  lightingIndex: z.record(z.string(), z.array(litInstanceSchema)),
  assets: z.array(exportAssetSchema)
});

export function parseGraphExportBundle(value: unknown): GraphExportBundle {
  return graphExportBundleSchema.parse(value);
}
