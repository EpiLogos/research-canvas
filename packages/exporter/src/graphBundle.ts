import { z } from "zod";

import type { ExportAsset, ExportBundle } from "@research-canvas/schema";
import { projectSchema } from "@research-canvas/schema";
import type {
  CanvasNodeSidecar,
  EdgeLayout,
  GraphNode,
  GraphRelationship,
  LitInstance,
  NodeLayout
} from "@research-canvas/desktop-api";

export interface GraphExportBundle {
  generatedAt: string;
  project: ExportBundle["project"];
  canvasId: string;
  nodes: GraphNode[];
  relationships: GraphRelationship[];
  nodeLayout: NodeLayout[];
  edgeLayout: EdgeLayout[];
  viewport: { x: number; y: number; zoom: number };
  appState: Record<string, unknown>;
  /** operatorGraphNodeId -> lit datable instances (precomputed for the backend-less viewer). */
  lightingIndex: Record<string, LitInstance[]>;
  assets: ExportAsset[];
}

const entityTypeSchema = z.enum([
  "Figure",
  "People",
  "Event",
  "Institution",
  "Source",
  "Place",
  "Work",
  "Archetype",
  "Dynamic",
  "PsychoidOperator"
]);

const temporalPrecisionSchema = z
  .enum(["year", "month", "day", "decade", "century", "millennium"])
  .nullable();

const graphNodeSchema: z.ZodType<GraphNode> = z.object({
  graphNodeId: z.string().min(1),
  entityType: entityTypeSchema,
  title: z.string(),
  body: z.string(),
  summary: z.string(),
  archetypalResonance: z.string().nullable(),
  coordinate: z.string().nullable(),
  sourceCoordinates: z.array(z.string()),
  isTemporal: z.boolean(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  temporalPrecision: temporalPrecisionSchema,
  createdAt: z.string(),
  updatedAt: z.string()
});

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
    content: z.string(),
    tags: z.array(z.string())
  }),
  z.object({
    type: z.literal("resource"),
    resourceKind: z.string(),
    absolutePath: z.string(),
    relativePath: z.string(),
    mimeType: z.string(),
    fileFingerprint: z.string()
  }),
  z.object({
    type: z.literal("group"),
    color: z.string(),
    childNodeIds: z.array(z.string())
  }),
  z.object({
    type: z.literal("portal"),
    targetCanvasId: z.string()
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
