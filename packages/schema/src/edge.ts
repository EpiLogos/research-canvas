import { z } from "zod";

export const edgeStyleSchema = z.object({
  stroke: z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/),
  width: z.number().positive(),
  dashed: z.boolean().default(false)
});

export const edgeSchema = z.object({
  id: z.string().uuid(),
  canvasId: z.string().uuid(),
  sourceNodeId: z.string().uuid(),
  targetNodeId: z.string().uuid(),
  relationKind: z.string().min(1),
  directionality: z.enum(["none", "forward", "backward", "bidirectional"]),
  label: z.string().default(""),
  note: z.string().default(""),
  style: edgeStyleSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type EdgeStyle = z.infer<typeof edgeStyleSchema>;
export type CanvasEdge = z.infer<typeof edgeSchema>;

