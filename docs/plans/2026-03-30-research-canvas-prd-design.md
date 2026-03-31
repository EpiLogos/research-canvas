# Research Canvas PRD and Design

**Date:** 2026-03-30  
**Status:** Drafted and validated through live product brainstorming  
**Audience:** Product, architecture, and implementation  
**Primary environment:** Local-first desktop authoring with static public export  

---

## 1. Product Summary

Research Canvas is a local-first desktop tool for organizing, shaping, and presenting dense research as an explorable visual argument. It is designed around the real workflow of building episodes, essays, and research-backed presentations rather than generic note-taking. The center of the product is an infinite canvas where files, notes, images, PDFs, and other resources can be placed spatially, connected by meaning-rich edges, grouped into thematic clusters, and overlaid with freehand drawing. Each node can also open into a focused full-page reading or viewing mode, so the product acts as both a map of ideas and a deep-dive research surface.

The product has two equally real surfaces from day one:

- A desktop authoring app for personal research, arrangement, and presentation building.
- A static exported public companion that lets other people explore the same material in read-only form without any backend or hosting dependency.

The desktop app is local-first, simple in infrastructure, and designed to feel close to the filesystem. It points at a chosen working folder, stores graph structure and app-native notes in SQLite, and lets the user work directly alongside an embedded terminal. The public export is a self-contained folder of static assets, graph data, rendered pages, and downloadable source resources.

This is not a generic PKM vault, not a SaaS collaboration suite, and not a whiteboard toy. It is a serious research and presentation workstation for a single author that publishes beautifully.

---

## 2. Product Goals

### Primary goals

- Make it easy to build an episode, argument, or research thread as a spatial graph of concrete resources.
- Support both associative map-making and ordered traversal through first-class sequences.
- Preserve a strong local-first workflow with almost no operational overhead.
- Let the user work directly against a real project folder and a real shell session.
- Publish projects as self-contained static bundles that can be opened locally or hosted anywhere.
- Keep the UI clean, legible, and fast rather than ornamental.

### Secondary goals

- Make the tool pleasant enough to live in for long periods through good search, file browsing, and terminal integration.
- Keep the data model open enough to support future selective publishing, richer export modes, or open-source community use.
- Ensure public viewers can download all published resources directly.

### Non-goals for v1

- Real-time multi-user collaboration.
- Managed cloud sync or hosted database services.
- Heavy in-app document editing as a replacement for Vim, LLM terminal work, or external editors.
- Full PPTX editing or bespoke slide authoring. Decks should be converted to PDF for first-class support.
- Generic AI copilot features. Agent workflows can happen through the embedded terminal from day one.

---

## 3. Product Principles

### Local-first is a product constraint, not a preference

The app should continue to function fully without a network connection. All authoring state lives locally. Export is static. Search is local. Resource handling assumes disk is primary.

### The canvas is semantic, not decorative

Spatial layout, edges, grouping, and sequences all carry meaning. The canvas is not just a surface to dump things on; it is part of the authored output.

### Filesystem truth plus app-native meaning

Research files remain real files in the chosen folder. The app stores graph structure, annotation, summaries, view state, and native notes in SQLite. This hybrid model avoids duplicating real resources while still giving the app enough structure to be powerful.

### Ordered flow matters as much as spatial relation

The product must support storyboard flow, historical chronology, logical argument flow, and research trails without flattening them into one axis. Sequences are therefore first-class alongside the freeform graph.

### Publishing is not an afterthought

The public viewer is not a degraded screenshot of the editor. Export must preserve graph, sequences, rendered resource pages, and download access in a coherent companion experience.

### Minimal styling, maximum clarity

The interface should be clean, stable, and legible, with adjustable font size and simple density controls. Avoid visual noise, avoid fake productivity gloss.

---

## 4. Core Use Cases

### UC1: Build an episode map from real materials

The user opens a project rooted in a real folder, browses its files, drags reports, markdown files, PDFs, and images onto the canvas, places them spatially, connects them with note-bearing edges, adds native notes, and groups related material into clusters.

### UC2: Shape multiple flows across the same material

The user creates named sequences such as `episode flow`, `historical sequence`, `logical chain`, and `source trail`. The same node can appear in multiple sequences without being duplicated.

### UC3: Draw over the thought surface

The user uses freehand strokes, highlight strokes, arrows, and text callouts to sketch emphasis and temporarily think on the map without converting every mark into a durable semantic node.

### UC4: Work alongside a live shell

The user keeps a project-scoped terminal open in the app, using `vim`, `bkmr`, `rg`, `claude`, `codex`, and other tools against the active project folder without leaving context.

### UC5: Drill into a node

The user clicks a resource or note node and moves into a focused full-page view showing the content, metadata, summary, download/open actions, related nodes, and sequence membership.

### UC6: Publish a public companion

The user exports a project into a self-contained static bundle and shares it as a folder or hosts it on any static site platform. Viewers explore the map, follow sequences, read rendered content, and download resources.

---

## 5. Product Surfaces

## 5.1 Desktop Authoring App

The desktop app is the primary product. It is built with Tauri v2 for a light native shell and web-tech UI, with Rust handling low-level operations such as PTY, filesystem watching, export orchestration, and local services.

### Main regions

- Left rail: workspace, nested projects, file explorer, saved searches, quick filters.
- Center: infinite canvas with graph and freehand layers.
- Right panel: node details, summaries, related nodes, edge metadata, sequence membership.
- Bottom dock: PTY-backed terminal.

### Key modes

- Map mode for spatial arrangement and graph editing.
- Full-page node mode for focused resource viewing.
- Sequence mode for guided traversal and presentation.

## 5.2 Static Public Viewer

The public viewer is a static web bundle generated from a project export. It is read-only and offline-capable when opened as a bundled site artifact. It reuses the same shared rendering components where possible.

### Viewer expectations

- Preserve authored desktop layout on desktop screens.
- Provide guided sequence-first fallback on smaller screens.
- Allow direct download of all exported resources.
- Render markdown and note content as static HTML.
- Display PDFs, images, and file metadata cleanly.

---

## 6. Information Architecture

The conceptual hierarchy is:

`Workspace -> Project -> Canvas -> Node / Edge / Annotation / Sequence`

### Workspace

A workspace is a chosen root folder on disk plus an app database location. It can contain multiple top-level projects and nested projects. It is the broadest scope for search, indexing, and terminal session defaults.

### Project

A project is the main authoring and publishing unit. It may correspond to a series, an episode, a research theme, or a subproject. Projects can nest, allowing structures such as:

- `Antichrist Project -> ep-0.2`
- `Series -> Episode 0.2 -> Public Companion`
- `Project -> Research -> Subtheme`

### Canvas

A canvas is a spatial graph surface within a project. Each project has one primary canvas and may contain subcanvases for focused domains or alternate views.

### Node

A node is a meaningful unit placed on the canvas.

### Edge

An edge is a meaningful relation between nodes, optionally directional and annotated.

### Annotation

An annotation is a freehand or callout element that sits on the canvas as expressive markup rather than domain structure.

### Sequence

A sequence is an ordered path across nodes and edges that captures narrative, chronology, logic, or guided exploration.

---

## 7. Data Model

## 7.1 Node Types

Node types are deliberately few and high-signal.

- `resource`: points to a real file, folder, or URL.
- `note`: app-native textual node stored in SQLite.
- `group`: spatial container for clustering.
- `portal`: link into another canvas or subcanvas.

The UI can present visual variants such as image cards, PDF cards, text cards, and folder cards, but those are render variants of the same core node model rather than separate top-level concepts.

## 7.2 Resource Types

Supported first-class resource families:

- Markdown and plain text
- PDF
- Image
- Audio
- Video
- Directory
- URL
- Other file as downloadable/openable binary

PPTX is not first-class in authoring. The supported path is deck-as-PDF.

## 7.3 Edge Model

Each edge contains:

- `id`
- `source_node_id`
- `target_node_id`
- `relation_kind`
- `directionality`
- `label`
- `note`
- `style`
- `created_at`
- `updated_at`

`relation_kind` may include author-defined values such as `supports`, `contrasts`, `echoes`, `causes`, `precedes`, `sources`, or `mirrors`.

## 7.4 Sequence Model

Each sequence contains:

- `id`
- `project_id`
- `canvas_id`
- `name`
- `kind` such as `storyboard`, `historical`, `logical`, `research`, `presentation`
- `description`
- `published`

Each sequence step contains:

- `id`
- `sequence_id`
- `position`
- `target_type` of `node` or `edge`
- `target_id`
- `caption`
- `viewport_x`
- `viewport_y`
- `viewport_zoom`
- `transition_hint`

The viewport state is essential for sequence playback and public guided viewing.

## 7.5 Annotation Model

Each annotation contains:

- `id`
- `canvas_id`
- `annotation_type` of `stroke`, `highlight`, `arrow`, `callout`
- `points`
- `style`
- `text`
- `bounds`
- `created_at`
- `updated_at`

Annotations are first-class persisted objects, not transient paint.

## 7.6 Workspace and Project Model

Projects contain:

- display name
- slug
- parent project id
- root path
- primary canvas id
- summary
- cover asset
- publish settings

Nested projects are implemented with adjacency plus recursive queries in SQLite.

## 7.7 Search Indexing

SQLite stores graph and notes directly. Resource metadata and extracted text are indexed into search tables backed by FTS5. Search documents should include:

- title
- summary
- extracted text
- tags
- node labels
- sequence names
- relative file path

---

## 8. Filesystem and Storage Strategy

## 8.1 Hybrid source of truth

The filesystem remains the source of truth for external resources. SQLite remains the source of truth for:

- projects
- canvases
- nodes
- edges
- sequences
- annotations
- summaries
- view state
- app-native notes
- resource metadata cache

## 8.2 Resource identity

Each resource node stores:

- absolute path for local operations
- project-relative path for portability and export
- file fingerprint for cache invalidation
- MIME-derived resource kind
- extracted title and preview metadata

## 8.3 File watching

The app watches the active workspace and project roots for file creation, deletion, rename, and modification. The file explorer and resource metadata refresh incrementally rather than through expensive full rescans.

## 8.4 Light editing

The app supports light editing for note nodes and basic markdown/text fixes. Heavy editing is expected to happen in external tools or inside the terminal.

---

## 9. Search and Discovery

Search must feel fast and useful enough that the user can live inside the app.

### Desktop search types

- Fuzzy search across files, nodes, sequences, and commands.
- Full-text search across indexed note and resource content.
- Filtered search by project, resource type, sequence, and relation.
- Command palette actions such as open project, create note, add sequence step, focus terminal, export project.

### Public export search types

- Client-side text search across exported metadata and rendered content.
- Sequence lookup and node lookup.
- No backend dependency.

### Recommended implementation

- SQLite FTS5 for durable desktop content indexing.
- `fuzzysort` for high-speed fuzzy ranking in the UI.
- `cmdk` for a clean command palette shell.

---

## 10. Canvas Interaction Model

The graph layer and annotation layer must coexist without fighting each other.

### Graph capabilities

- Pan and zoom
- Drag/drop node placement
- Multi-select
- Edge creation
- Edge note editing
- Group framing
- Portal navigation

### Annotation capabilities

- Pen stroke
- Highlighter stroke
- Arrow stroke
- Text callout
- Erase selected annotation
- Toggle visibility by layer

### Interaction rules

- Annotation tools temporarily switch the pointer into draw mode.
- Graph manipulation and annotation editing remain separable.
- Annotations can be locked or hidden to reduce accidental edits.
- Sequence playback can optionally hide freehand layers for public cleanliness.

### Recommended implementation

Use React Flow as the graph substrate and implement a custom overlay annotation layer using `perfect-freehand`. This avoids dependence on proprietary or licensed whiteboard features while keeping the graph model strong.

---

## 11. Node Drill-In and Side Panels

Every node should support both summary inspection and deep focus.

### Right-side detail panel

For the currently selected node or edge, show:

- title
- resource type
- summary
- related nodes
- inbound and outbound edges
- sequence membership
- file metadata
- quick actions

### Full-page node view

When opened, a node expands into a reader or viewer surface showing:

- content renderer
- summary and metadata
- related nodes sidebar
- download action
- open in system app action
- jump back to map action

### Rendering expectations

- Markdown and notes: rendered cleanly with light edit option.
- PDF: embedded viewer plus direct download.
- Images: zoomable viewer plus metadata.
- Audio/video: native HTML media playback where applicable.
- Directories and unknown files: metadata and download/open actions.

---

## 12. Terminal and Agent Integration

The embedded terminal is a core product feature from day one.

### Requirements

- Real PTY, not log streaming.
- Active cwd follows current workspace or selected project.
- Multiple sessions and tabs.
- Resizable dock.
- Stable support for interactive terminal applications.

### Intended workflows

- Run `vim`, `nvim`, or other editors.
- Use `bkmr` directly inside the terminal.
- Use `rg`, `fd`, `jq`, and shell workflows against the active project.
- Run `claude`, `codex`, or other local agent tools in context.

### Architecture

- Frontend terminal UI: `xterm.js`
- Backend PTY: Rust with `portable-pty`
- Shell processes spawned per project/session and persisted across view changes

This keeps the app honest: it is a research cockpit, not an overreaching editor replacement.

---

## 13. Public Export Model

Publishing must be simple enough that users can share work without standing up infrastructure.

### Export target

The exporter emits a self-contained static bundle such as:

```text
exports/ep-0.2/
  index.html
  assets/
  data/
  node/
  search/
```

### Export contents

- static viewer app
- graph and sequence data
- rendered note and markdown pages
- copied downloadable resource files
- preview thumbnails where useful
- search index for offline or static-hosted use

### Export rules

- All published resources are downloadable.
- All links inside the bundle are relative and portable.
- The viewer must work as a hosted static site.
- The bundle should also support local opening without a backend. To avoid `fetch()` issues on `file://`, the boot path should inline or bundle required data into generated assets rather than requiring runtime API calls.

### Public viewer behavior

- Desktop: preserve authored canvas layout.
- Smaller screens: sequence-first and list-first exploration with map access secondary.
- Download buttons available on all eligible node pages.

---

## 14. Suggested Technical Architecture

## 14.1 Core Stack

- Desktop shell: Tauri v2
- Backend services: Rust
- UI: React + TypeScript + Vite
- Database: SQLite with FTS5
- Graph canvas: React Flow
- Freehand overlay: perfect-freehand
- Terminal: xterm.js + portable-pty

## 14.2 Monorepo Shape

```text
apps/
  desktop/
    src/
    src-tauri/
packages/
  schema/
  canvas/
  viewers/
  search/
  exporter/
  desktop-api/
  ui/
tests/
  e2e/
  fixtures/
docs/
  plans/
```

### Package responsibilities

- `schema`: shared TypeScript types and validation for graph/export payloads.
- `canvas`: React Flow wrappers, custom nodes, edges, annotation overlay, sequence playback components.
- `viewers`: markdown, PDF, image, media, and file metadata renderers.
- `search`: search adapters, rankers, query normalization.
- `exporter`: static bundle generation and manifest writers.
- `desktop-api`: typed frontend wrappers around Tauri commands/events.
- `ui`: shared UI primitives and layout components.

## 14.3 Rust backend modules

The Rust backend in the Tauri app should own:

- database repository layer
- migrations
- filesystem watcher and metadata extraction
- PTY orchestration
- search indexing workers
- export pipeline

This prevents SQL, file IO, and process concerns from leaking chaotically into the frontend.

---

## 15. Open-Source and Dependency Decisions

### Approved dependencies

- Tauri v2 for local-first desktop shell, filesystem access, and sidecar-compatible architecture.
- React Flow / xyflow for graph-native canvas behavior and custom nodes/edges.
- perfect-freehand for MIT-licensed freehand stroke generation.
- xterm.js for terminal rendering.
- portable-pty for cross-platform PTY support.
- SQLite FTS5 for indexed search.
- react-arborist for tree/file explorer UI.
- cmdk for command palette.
- fuzzysort for fast fuzzy ranking.
- CodeMirror 6 for light note and markdown editing.
- markdown-it for markdown rendering/export preprocessing.

### Deferred or rejected choices

- tldraw as primary canvas substrate: rejected for now because the product is graph-first and the current production SDK licensing posture adds avoidable friction.
- react-pdf-viewer: rejected because the repository is archived and the project directs users toward commercial licensing.
- Native PPTX rendering: deferred in favor of PDF conversion.
- Managed search/database services: rejected as out of scope and contrary to local-first goals.

### `bkmr` stance

`bkmr` is useful and should be considered a first-class companion workflow, but it is not the canonical data backend for the app. The app should instead make terminal usage frictionless so `bkmr` can be used naturally in the embedded shell against the project context. Later automation helpers may be added, but they are not required for v1.

---

## 16. Reliability, Security, and Privacy

### Reliability

- Migrations must be deterministic and versioned.
- Export must be reproducible from the same project state.
- The app should degrade gracefully if an external file is moved or deleted.
- PTY sessions should survive most navigation events.

### Privacy

- No cloud dependency by default.
- No telemetry in the core product unless explicitly added later.
- Public export only includes resources intentionally within the exported project scope.

### Safety checks

- Export must copy only project-scoped or explicitly allowed files.
- Download links should never leak original absolute local paths.
- Deleted or missing resources should be surfaced clearly in authoring mode.

---

## 17. Performance Targets

The app should feel fast on ordinary personal research projects, not only toy demos.

### Desktop targets

- Initial open of a medium project under 3 seconds after cache warm.
- Pan/zoom and drag interactions visually smooth at typical canvas scales.
- Search result latency under 100ms for common queries.
- Terminal startup under 1 second for a warm shell.

### Export targets

- Export should complete for medium projects in under 30 seconds on a modern laptop.
- Public bundle should remain usable offline and on static hosts.

### Scaling strategies

- Virtualized file tree.
- Incremental indexing.
- Lazy resource preview generation.
- Render only visible canvas elements where possible.

---

## 18. Testing Strategy

Testing quality is a core product requirement. Mock-heavy theater is not acceptable.

### Backend tests

- Real SQLite migration tests.
- Repository tests against temp databases.
- Filesystem index tests against real fixture trees.
- PTY tests that spawn a real shell in a temp project directory.
- Export tests that generate a real static bundle and verify outputs.

### Frontend tests

- Component tests for node viewers, annotation tools, and sequence playback.
- Integration tests for canvas interactions using the real app state model.
- Search tests against realistic indexed fixtures.

### End-to-end tests

- Create project, add node, connect edge, annotate, save, reload.
- Open terminal, verify cwd, run a command.
- Build sequence and traverse it.
- Export project and open generated viewer.
- Verify resource download links resolve.

### Fixtures

Use real markdown, PDF, image, and nested folder fixtures derived from representative research projects. Avoid trivial toy data once the harness exists.

---

## 19. Rollout Strategy

### Phase 1: Working authoring core

- workspace and nested projects
- file explorer
- graph canvas
- resource and note nodes
- edge notes
- SQLite persistence
- right detail panel
- full-page node view
- PTY terminal

### Phase 2: Research-native polish

- sequences
- freehand annotations
- search palette
- related-node discovery
- light markdown editing
- exportable static viewer

### Phase 3: Public companion quality

- mobile fallback
- presentation mode
- publish profiles
- performance hardening
- richer export theming and metadata

The product ambition stays full-size. Phasing only controls build order.

---

## 20. Acceptance Criteria

The design is successful when all of the following are true:

- A user can point the app at a real project folder and create a nested project structure.
- A user can place real files and native notes on an infinite canvas and connect them meaningfully.
- A user can create multiple sequences across the same material without duplication.
- A user can draw and annotate over the canvas from day one.
- A user can run a real shell inside the app in the active project directory.
- A user can click into a node and read or view its content in focused mode.
- A user can export a project into a self-contained static bundle.
- A public viewer can explore the map, follow sequences, and download all published resources.
- The system is covered by real integration and end-to-end tests rather than mock-only confidence theater.

---

## 21. Open Questions Held for Implementation

These are implementation-level decisions, not product ambiguities:

- Whether the SQLite access layer is built directly in Rust or partially through an official Tauri SQL plugin boundary.
- Whether resource text extraction uses Rust-native libraries first or a small sidecar utility for specific formats.
- Whether note rendering and markdown export precompute all HTML at export time or partially render client-side for reuse.
- Whether the file explorer stores user-defined pins and favorites in SQLite or project-local config.

None of these questions change the product direction.

---

## 22. Recommended Next Artifact

The next artifact should be a full implementation plan that:

- defines the monorepo/package structure,
- names the exact modules to create,
- specifies test-first execution order,
- stages the authoring core before later polish,
- and preserves the full ambition of the product rather than shrinking scope.

This document is the architectural north star for that plan.

---

## 23. Source Notes For Architecture Decisions

The following sources were checked during design research for current capability and suitability:

- Tauri v2 plugin and sidecar documentation
- React Flow / xyflow open-source docs
- perfect-freehand project documentation
- xterm.js documentation
- portable-pty crate documentation
- SQLite FTS5 documentation
- cmdk documentation
- bkmr repository documentation and release status

These were used to validate feasibility and dependency posture as of 2026-03-30.
