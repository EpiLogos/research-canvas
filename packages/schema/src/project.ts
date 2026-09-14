import { z } from "zod";

export const publishSettingsSchema = z.object({
  includeResources: z.boolean(),
  mobileSequenceFirst: z.boolean(),
  theme: z.enum(["paper", "nocturne", "ledger"]).default("paper")
});

export const PROJECT_ROOT_TYPES = ["directory", "file"] as const;
export type ProjectRootType = (typeof PROJECT_ROOT_TYPES)[number];

export const projectSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  parentConstellationId: z.string().uuid().nullable(),
  rootPath: z.string().min(1),
  rootType: z.enum(PROJECT_ROOT_TYPES),
  profileScope: z.string().min(1),
  primaryCanvasId: z.string().uuid(),
  summary: z.string().default(""),
  coverAssetPath: z.string().nullable(),
  publishSettings: publishSettingsSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type PublishSettings = z.infer<typeof publishSettingsSchema>;
export type Project = z.infer<typeof projectSchema>;
