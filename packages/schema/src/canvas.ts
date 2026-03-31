import { z } from "zod";

export const viewportSchema = z.object({
  x: z.number(),
  y: z.number(),
  zoom: z.number().positive()
});

export const canvasSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().min(1),
  kind: z.enum(["primary", "subcanvas"]).default("primary"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastViewport: viewportSchema.optional()
});

export type Viewport = z.infer<typeof viewportSchema>;
export type Canvas = z.infer<typeof canvasSchema>;

