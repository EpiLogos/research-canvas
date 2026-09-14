import { z } from "zod";

/**
 * Canonical identifiers for the six named surfaces in the Research Canvas
 * shell. These are first-class navigational destinations; affordances such as
 * Reading, Search, Command Palette, and Terminal are deliberately excluded.
 */
export type SurfaceId =
  | "projects"
  | "canvas"
  | "timeline"
  | "places"
  | "story"
  | "palace";

/**
 * Static metadata describing the data contract of a single surface.
 *
 * @template TViewState  Shape of the persistent per-surface view state.
 * @template TMutations  Record of mutation names to their payload types.
 */
export interface SurfaceConfig<TViewState, TMutations extends Record<string, unknown> = Record<string, unknown>> {
  /** Canonical surface identifier. */
  id: SurfaceId;
  /** Human-readable label shown in the shell. */
  displayName: string;
  /** Icon identifier consumed by the shell's icon component. */
  iconName: string;
  /** Optional shell lens key this surface maps to (e.g. "canvas"). */
  lens?: string | null;
  /** Whether the surface can only be rendered inside an active project workspace. */
  requiresProject: boolean;
  /** Zod schema used to validate/parse persisted per-tab view state. */
  persistentTabStateSchema: z.ZodSchema<TViewState>;
  /** Default view state used when no persisted tab state exists. */
  defaultViewState: TViewState;
  /** Optional map of named mutations this surface emits to the shell. */
  mutations?: TMutations;
}

const viewportStateSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  zoom: z.number().default(1),
});

const timelineViewportSchema = z.object({
  centerYear: z.number().default(0),
  pixelsPerYear: z.number().default(20),
});

const emptyStateSchema = z.object({}).default({});

/**
 * Single source-of-truth registry mapping every `SurfaceId` to its metadata
 * contract. This object is intended to be imported by the shell and any code
 * that needs to enumerate or dispatch to surfaces.
 */
export const SURFACE_REGISTRY: Record<SurfaceId, SurfaceConfig<unknown, Record<string, unknown>>> = {
  projects: {
    id: "projects",
    displayName: "Projects",
    iconName: "FolderKanban",
    requiresProject: false,
    persistentTabStateSchema: emptyStateSchema,
    defaultViewState: {},
  },
  canvas: {
    id: "canvas",
    displayName: "Canvas",
    iconName: "Layout",
    lens: "canvas",
    requiresProject: true,
    persistentTabStateSchema: viewportStateSchema,
    defaultViewState: { x: 0, y: 0, zoom: 1 },
  },
  timeline: {
    id: "timeline",
    displayName: "Timeline",
    iconName: "CalendarDays",
    lens: "timeline",
    requiresProject: true,
    persistentTabStateSchema: timelineViewportSchema,
    defaultViewState: { centerYear: 0, pixelsPerYear: 20 },
  },
  places: {
    id: "places",
    displayName: "Places",
    iconName: "MapPin",
    lens: "places",
    requiresProject: true,
    persistentTabStateSchema: viewportStateSchema,
    defaultViewState: { x: 0, y: 0, zoom: 1 },
  },
  story: {
    id: "story",
    displayName: "Story",
    iconName: "BookOpen",
    lens: "story",
    requiresProject: true,
    persistentTabStateSchema: emptyStateSchema,
    defaultViewState: {},
  },
  palace: {
    id: "palace",
    displayName: "Palace",
    iconName: "Brain",
    lens: "palace",
    requiresProject: true,
    persistentTabStateSchema: emptyStateSchema,
    defaultViewState: {},
  },
};

/**
 * Convenience array of all canonical surface ids, in the order the shell
 * should present them.
 */
export const SURFACE_IDS: SurfaceId[] = ["projects", "canvas", "timeline", "places", "story", "palace"];
