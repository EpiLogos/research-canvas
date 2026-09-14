# Surface Registry

This document defines the six named **surfaces** in the Research Canvas shell and the four global **affordances** that live alongside them. The canonical runtime definitions live in `packages/schema/src/surface.ts`.

## Surface vs. affordance

A **surface** is a first-class navigational destination with a persistent tab state and a project-scoped or project-agnostic contract. An **affordance** is a transient shell utility; it has a keyboard shortcut and a route slot, but it is not a `SurfaceId` and has no registry entry.

## Surfaces

| Surface | Input data | Output mutations | Keyboard shortcut | Route path |
|---------|------------|------------------|---------------------|------------|
| **Projects** | Project list, workspace metadata, recent/open states | `openProject`, `createProject`, `closeProject` | `Cmd+Shift+O` (open) | `/projects` |
| **Canvas** | `Canvas`, `Node[]`, `Edge[]`, `Annotation[]`, viewport state | `addNode`, `moveNode`, `addEdge`, `addAnnotation`, `setViewport` | `Cmd+1` | `/canvas/:canvasId` |
| **Timeline** | Temporal `GraphNode[]`, `TimelineRelationField`, year viewport | `setYearViewport`, `selectTemporalNode`, `filterEra` | `Cmd+2` | `/timeline` |
| **Places** | `GraphNode[]` with place coverage, basemap/geospatial metadata | `setMapViewport`, `selectPlace`, `clusterPlaces` | `Cmd+Shift+P` | `/places` |
| **Story** | Sequence definitions, narrative ordering, playback viewport | `selectSequence`, `playSequence`, `setSequenceViewport` | `Cmd+Shift+S` | `/story` |
| **Palace** | Memory-palace layout, spatial anchors, recall graph | `setPalaceViewport`, `anchorNode`, `recallNode` | `Cmd+Shift+M` | `/palace` |

## Affordances

These appear in the shell but are **not** `SurfaceId` values and are not registered in `SURFACE_REGISTRY`.

| Affordance | Role | Keyboard shortcut | Route path |
|------------|------|-------------------|------------|
| **Reading** | Full-screen and overlay reader for a single `ReaderRecord` | `Cmd+3` (overlay), `Esc` to close | `/read/:graphNodeId` |
| **Search** | Fuzzy file/node search panel in the left browser | `Cmd+B` to open browser, `Cmd+Shift+F` | `/search` |
| **Command Palette** | Global command launcher | `Cmd+K` | `/palette` |
| **Terminal** | Embedded PTY dock at the bottom of the shell | `Cmd+J` to toggle dock | `/terminal` |

## Data contract

```ts
import { z } from "zod";

export type SurfaceId =
  | "projects"
  | "canvas"
  | "timeline"
  | "places"
  | "story"
  | "palace";

export interface SurfaceConfig<TViewState, TMutations extends Record<string, unknown> = Record<string, unknown>> {
  id: SurfaceId;
  displayName: string;
  iconName: string;
  lens?: string | null;
  requiresProject: boolean;
  persistentTabStateSchema: z.ZodSchema<TViewState>;
  defaultViewState: TViewState;
  mutations?: TMutations;
}
```

## Decisions

- `projects` is a surface even though it does not require a project; it is the entry surface used to open or create one.
- `canvas`, `timeline`, `places`, `story`, and `palace` all require an active project (`requiresProject: true`).
- `reading`, `search`, `palette`, and `terminal` are deliberately excluded from `SurfaceId` and `SURFACE_REGISTRY`.
- The `lens` field is optional because not every surface maps 1:1 to a shell lens mode (e.g. `projects`).
- `persistentTabStateSchema` is typed as a Zod schema so the shell can validate persisted tab state at runtime.
