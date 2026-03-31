import { z } from "zod";

import { viewportSchema } from "./canvas";

export const sequenceSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  canvasId: z.string().uuid(),
  name: z.string().min(1),
  kind: z.enum(["storyboard", "historical", "logical", "research", "presentation"]),
  description: z.string().default(""),
  published: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const sequenceStepSchema = z.object({
  id: z.string().uuid(),
  sequenceId: z.string().uuid(),
  position: z.number().int().nonnegative(),
  targetType: z.enum(["node", "edge"]),
  targetId: z.string().uuid(),
  caption: z.string().default(""),
  viewport: viewportSchema,
  transitionHint: z.enum(["cut", "ease", "spotlight"]).default("ease")
});

export type Sequence = z.infer<typeof sequenceSchema>;
export type SequenceStep = z.infer<typeof sequenceStepSchema>;

