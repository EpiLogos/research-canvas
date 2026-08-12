import { z } from "zod";
import { viewportSchema } from "./canvas";
import { SURFACE_IDS } from "./surface";

export { SURFACE_IDS };

// -----------------------------------------------------------------------------
// Surface-tab state discriminated union
// -----------------------------------------------------------------------------

export const canvasTabStateSchema = z.object({
  surfaceId: z.literal("canvas"),
  canvasId: z.string().min(1),
  constellationId: z.string().min(1),
  viewport: viewportSchema,
  selectedGraphNodeId: z.string().nullable().optional(),
  selectedEdgeId: z.string().nullable().optional(),
});

const timelineTabStateSchema = z.object({
  surfaceId: z.literal("timeline"),
  centerYear: z.number(),
  pixelsPerYear: z.number().positive(),
  selectedGraphNodeId: z.string().nullable().optional(),
});

const placesTabStateSchema = z.object({
  surfaceId: z.literal("places"),
  viewport: viewportSchema,
  selectedGraphNodeId: z.string().nullable().optional(),
});

const projectsTabStateSchema = z.object({
  surfaceId: z.literal("projects"),
});

const storyTabStateSchema = z.object({
  surfaceId: z.literal("story"),
});

const palaceTabStateSchema = z.object({
  surfaceId: z.literal("palace"),
});

export const surfaceTabStateSchema = z.discriminatedUnion("surfaceId", [
  projectsTabStateSchema,
  canvasTabStateSchema,
  timelineTabStateSchema,
  placesTabStateSchema,
  storyTabStateSchema,
  palaceTabStateSchema,
]);

export type SurfaceTabState = z.infer<typeof surfaceTabStateSchema>;

// -----------------------------------------------------------------------------
// AppTab
// -----------------------------------------------------------------------------

export const appTabSchema = z.object({
  id: z.string().min(1),
  surfaceId: z.enum(SURFACE_IDS),
  title: z.string().min(1),
  pinned: z.boolean().default(false),
  state: surfaceTabStateSchema,
});

export type AppTab = z.infer<typeof appTabSchema>;

export const appTabArraySchema = z.array(appTabSchema);

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

export function isCanvasTabState(state: SurfaceTabState): state is Extract<SurfaceTabState, { surfaceId: "canvas" }> {
  return state.surfaceId === "canvas";
}

export function isTimelineTabState(state: SurfaceTabState): state is Extract<SurfaceTabState, { surfaceId: "timeline" }> {
  return state.surfaceId === "timeline";
}

export function makeCanvasTabId(constellationId: string, canvasId: string): string {
  return `${constellationId}:${canvasId}`;
}

export function parseCanvasTabId(tabId: string): { constellationId: string; canvasId: string } | null {
  const index = tabId.indexOf(":");
  if (index === -1) return null;
  return {
    constellationId: tabId.slice(0, index),
    canvasId: tabId.slice(index + 1),
  };
}
