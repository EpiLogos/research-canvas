import { z } from "zod";

import { annotationSchema } from "./annotation";
import { canvasSchema } from "./canvas";
import { edgeSchema } from "./edge";
import { nodeSchema } from "./node";
import { projectSchema } from "./project";

export const exportAssetSchema = z.object({
  nodeId: z.string().uuid(),
  sourcePath: z.string().min(1),
  relativePath: z.string().min(1),
  downloadName: z.string().min(1),
  mimeType: z.string().min(1)
});

export const exportBundleSchema = z
  .object({
    generatedAt: z.string().datetime(),
    project: projectSchema,
    canvases: z.array(canvasSchema),
    nodes: z.array(nodeSchema),
    edges: z.array(edgeSchema),
    annotations: z.array(annotationSchema),
    assets: z.array(exportAssetSchema).default([])
  })
  .superRefine((bundle, ctx) => {
    const canvasIds = new Set(bundle.canvases.map((canvas) => canvas.id));
    const nodeIds = new Set(bundle.nodes.map((node) => node.id));

    if (!canvasIds.has(bundle.project.primaryCanvasId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "project.primaryCanvasId must reference one of the bundle canvases",
        path: ["project", "primaryCanvasId"]
      });
    }

    bundle.canvases.forEach((canvas, index) => {
      if (canvas.projectId !== bundle.project.id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "canvas.projectId must match the bundle project",
          path: ["canvases", index, "projectId"]
        });
      }
    });

    bundle.nodes.forEach((node, index) => {
      if (!canvasIds.has(node.canvasId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "node.canvasId must reference one of the bundle canvases",
          path: ["nodes", index, "canvasId"]
        });
      }
    });

    bundle.edges.forEach((edge, index) => {
      if (!canvasIds.has(edge.canvasId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "edge.canvasId must reference one of the bundle canvases",
          path: ["edges", index, "canvasId"]
        });
      }

      if (!nodeIds.has(edge.sourceNodeId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "edge.sourceNodeId must reference a bundle node",
          path: ["edges", index, "sourceNodeId"]
        });
      }

      if (!nodeIds.has(edge.targetNodeId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "edge.targetNodeId must reference a bundle node",
          path: ["edges", index, "targetNodeId"]
        });
      }
    });

    bundle.annotations.forEach((annotation, index) => {
      if (!canvasIds.has(annotation.canvasId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "annotation.canvasId must reference one of the bundle canvases",
          path: ["annotations", index, "canvasId"]
        });
      }
    });

    bundle.assets.forEach((asset, index) => {
      if (!nodeIds.has(asset.nodeId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "asset.nodeId must reference a bundle node",
          path: ["assets", index, "nodeId"]
        });
      }
    });
  });

export type ExportAsset = z.infer<typeof exportAssetSchema>;
export type ExportBundle = z.infer<typeof exportBundleSchema>;
