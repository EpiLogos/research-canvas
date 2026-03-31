import { z } from "zod";

export const positionSchema = z.object({
  x: z.number(),
  y: z.number()
});

export const sizeSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive()
});

const baseNodeSchema = z.object({
  id: z.string().uuid(),
  canvasId: z.string().uuid(),
  title: z.string().min(1),
  position: positionSchema,
  size: sizeSchema,
  summary: z.string().default(""),
  dotColour: z.string().optional(),
  bgColour: z.string().optional(),
  textColour: z.string().optional(),
  thumbnail: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const resourceNodeSchema = baseNodeSchema.extend({
  type: z.literal("resource"),
  resourceKind: z.enum(["markdown", "text", "pdf", "image", "audio", "video", "directory", "url", "binary"]),
  absolutePath: z.string().min(1),
  relativePath: z.string().min(1),
  mimeType: z.string().min(1),
  fileFingerprint: z.string().min(1),
  url: z.string().url().optional()
});

export const noteNodeSchema = baseNodeSchema.extend({
  type: z.literal("note"),
  content: z.string(),
  tags: z.array(z.string()).default([])
});

export const groupNodeSchema = baseNodeSchema.extend({
  type: z.literal("group"),
  color: z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/),
  childNodeIds: z.array(z.string().uuid()).default([])
});

export const portalNodeSchema = baseNodeSchema.extend({
  type: z.literal("portal"),
  targetCanvasId: z.string().uuid()
});

export const nodeSchema = z.discriminatedUnion("type", [
  resourceNodeSchema,
  noteNodeSchema,
  groupNodeSchema,
  portalNodeSchema
]);

export type Position = z.infer<typeof positionSchema>;
export type Size = z.infer<typeof sizeSchema>;
export type ResourceNode = z.infer<typeof resourceNodeSchema>;
export type NoteNode = z.infer<typeof noteNodeSchema>;
export type GroupNode = z.infer<typeof groupNodeSchema>;
export type PortalNode = z.infer<typeof portalNodeSchema>;
export type CanvasNode = z.infer<typeof nodeSchema>;

