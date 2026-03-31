import { z } from "zod";

import { positionSchema, sizeSchema } from "./node";

export const pointSchema = z.object({
  x: z.number(),
  y: z.number(),
  pressure: z.number().min(0).max(1).optional()
});

export const annotationStyleSchema = z.object({
  color: z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/),
  width: z.number().positive(),
  opacity: z.number().min(0).max(1)
});

export const annotationSchema = z.object({
  id: z.string().uuid(),
  canvasId: z.string().uuid(),
  annotationType: z.enum(["stroke", "highlight", "arrow", "callout"]),
  points: z.array(pointSchema).min(1),
  style: annotationStyleSchema,
  text: z.string().optional(),
  bounds: z.object({
    position: positionSchema,
    size: sizeSchema
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type AnnotationPoint = z.infer<typeof pointSchema>;
export type AnnotationStyle = z.infer<typeof annotationStyleSchema>;
export type Annotation = z.infer<typeof annotationSchema>;

