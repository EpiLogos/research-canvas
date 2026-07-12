import { z } from "zod";

import type { ExportAsset, ExportBundle } from "@research-canvas/schema";
import { projectSchema } from "@research-canvas/schema";

export type GraphBundleEntityType =
  | "Figure"
  | "People"
  | "Event"
  | "Institution"
  | "Source"
  | "Place"
  | "Work"
  | "Archetype"
  | "Dynamic"
  | "PsychoidOperator";

export type GraphBundleTemporalPrecision =
  | "year"
  | "month"
  | "day"
  | "decade"
  | "century"
  | "millennium"
  | null;

export interface GraphBundleNode {
  graphNodeId: string;
  entityType: GraphBundleEntityType;
  title: string;
  body: string;
  summary: string;
  archetypalResonance: string | null;
  coordinate: string | null;
  sourceCoordinates: string[];
  evidenceTags: string[];
  sourceKind: string | null;
  isTemporal: boolean;
  validFrom: string | null;
  validTo: string | null;
  temporalPrecision: GraphBundleTemporalPrecision;
  createdAt: string;
  updatedAt: string;
}

export interface GraphBundleRelationship {
  id: string;
  relType: string;
  sourceGraphNodeId: string;
  targetGraphNodeId: string;
  properties: Record<string, unknown>;
}

export type GraphBundleCanvasNodeSidecar =
  | { type: "note"; title: string; content: string; tags: string[] }
  | {
      type: "resource";
      title: string;
      resourceKind: string;
      absolutePath: string;
      relativePath: string;
      mimeType: string;
      fileFingerprint: string;
    }
  | { type: "group"; title: string; color: string; childNodeIds: string[] }
  | { type: "portal"; title: string; targetCanvasId: string };

export interface GraphBundleNodeLayout {
  graphNodeId: string;
  canvasId: string;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  style: {
    dotColour?: string;
    bgColour?: string;
    textColour?: string;
    thumbnail?: string;
    __canvasNode?: GraphBundleCanvasNodeSidecar;
  };
}

export interface GraphBundleEdgeLayout {
  id: string;
  canvasId: string;
  sourceGraphNodeId: string;
  targetGraphNodeId: string;
  relationKind: string;
  sourceHandleId?: string;
  targetHandleId?: string;
  style: { stroke?: string; width?: number; dashed?: boolean };
}

export interface GraphBundleLitInstance {
  node: GraphBundleNode;
  relType: "INSTANTIATES" | "ECHOES" | "RESONATES_WITH";
  dominance: "dominant" | "secondary" | null;
}

export interface GraphExportBundle {
  generatedAt: string;
  project: ExportBundle["project"];
  canvasId: string;
  nodes: GraphBundleNode[];
  relationships: GraphBundleRelationship[];
  nodeLayout: GraphBundleNodeLayout[];
  edgeLayout: GraphBundleEdgeLayout[];
  viewport: { x: number; y: number; zoom: number };
  appState: Record<string, unknown>;
  /** operatorGraphNodeId -> lit datable instances (precomputed for the backend-less viewer). */
  lightingIndex: Record<string, GraphBundleLitInstance[]>;
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

const graphNodeSchema: z.ZodType<GraphBundleNode> = z.object({
  graphNodeId: z.string().min(1),
  entityType: entityTypeSchema,
  title: z.string(),
  body: z.string(),
  summary: z.string(),
  archetypalResonance: z.string().nullable(),
  coordinate: z.string().nullable(),
  sourceCoordinates: z.array(z.string()),
  evidenceTags: z.array(z.string()).default([]),
  sourceKind: z.string().nullable().default(null),
  isTemporal: z.boolean(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  temporalPrecision: temporalPrecisionSchema,
  createdAt: z.string(),
  updatedAt: z.string()
});

const graphRelationshipSchema: z.ZodType<GraphBundleRelationship> = z.object({
  id: z.string().min(1),
  relType: z.string().min(1),
  sourceGraphNodeId: z.string().min(1),
  targetGraphNodeId: z.string().min(1),
  properties: z.record(z.string(), z.unknown())
});

const canvasNodeSidecarSchema: z.ZodType<GraphBundleCanvasNodeSidecar> = z.union([
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
    targetCanvasId: z.string()
  })
]);

const nodeLayoutSchema: z.ZodType<GraphBundleNodeLayout> = z.object({
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

const edgeLayoutSchema: z.ZodType<GraphBundleEdgeLayout> = z.object({
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

const litInstanceSchema: z.ZodType<GraphBundleLitInstance> = z.object({
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
