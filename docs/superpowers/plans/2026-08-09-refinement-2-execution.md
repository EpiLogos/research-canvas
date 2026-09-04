# Refinement 2 execution plan

Canonical design: `docs/wayfinder/2026-08-09-refinement-2-design.md`  
Map: GitHub issue #17 — "Refinement 2 map — Places, Stories, Palace"  
Branch: `codex/surfaces-slices`

## Global Constraints

- Offline-first core with explicit live opt-ins; no new network dependency.
- Raw corpus is canonical and agent-immutable; every derived artifact carries passage-level provenance.
- Two-store split preserved: graph substance in Neo4j/Graphiti; layout/presentation in SQLite. Joins happen only at the Rust repository layer, never from the frontend.
- The frontend talks exclusively through `WorkspaceTransport` (`packages/desktop-api`); the web build swaps in a read-only static-bundle transport.
- No new locked substrate node/relationship categories, with exactly one deliberate exception: the `ENCAPSULATES` substrate relation added by Task 6.
- Real tests, no mocks: use real SQLite temp dirs, real fixture filesystem, real graph data, real browser e2e.
- Run Rust tests with `--test-threads=1` to avoid SQLite contention.
- Profile-aware shaping: QL vocabulary is tacit geometry for the bootstrapping profile only; never forced on non-bootstrapping profiles.
- Keep file, folder, and package names as specified unless a documented change is necessary.
- Remove dead code from superseded implementations as they are replaced.

## Task 1: Profiles as project layer — profile-scoped projects routing surfaces

**Source:** GitHub issue #24.  
**Blocked by:** none (foundational).  
**Blocks:** #25, #26, #27.

### Goal
Make the project the entry point into all surfaces. A project carries `profileScope` and `rootType` (`directory` | `file`), is selected from a research-canvas home directory, and routes into the existing icons/surfaces.

### Steps
1. Add `profileScope` and `rootType` to `projectSchema` in `packages/schema` with validation tests using real records.
2. Implement first-run home setup: create or select the research-canvas home directory; package this setup path. Directory projects use a known skeleton (immutable raw corpus + derived workspace). File projects keep derived data in the app-managed workspace store keyed by path/hash and never write the raw file.
3. Wire project open/select through the workspace transport into the surfaces so every surface reads its profile from the active project.
4. Update scene/sequence/curation/street-view repository reads to scope by the active project's profile (repository-layer joins only).
5. Ensure project switching switches surface scopes with no stale cross-profile state.
6. Update existing profile-scoped suites and keep them green.

### Acceptance
- A profile-scoped project opens from a directory or a file under the research canvas home, its surfaces read profile-derived data, and switching projects switches scopes — tested through real transport contracts, no mocks.
- `pnpm vitest run` + Rust suites green; typecheck clean.

## Task 2: Places surface — rename + globe

**Source:** GitHub issue #18.  
**Blocked by:** none.  
**Blocks:** #19, #20, #21.

### Goal
Rename the psychogeographic lens to "Places" and make the MapLibre GL JS globe the default surface, fully offline from the bundled pack.

### Steps
1. Rename user-visible "Psychogeographic" → "Places" across the shell, lens components, tests, public viewer, and docs. Keep internal keys stable for data compatibility.
2. Switch the Places surface to MapLibre globe projection (`projection: "globe"`, `maplibre-gl@6.2.0`), terrain-less v1: dark ocean, graticule, place points from the bundled `basemap.geojson`.
3. Adapt `MapSurfaceRenderer` and its adapter to support globe mode; keep the test adapter unchanged.
4. Implement place-to-place camera flight (`flyTo`) over the globe between Temporal Places.
5. Render walk routes as great-circle GeoJSON `LineString` arcs on the globe; allow explicit control points.
6. Make the flat map the detail view: clicking a place or walk stop on the globe descends into the flat map, with one action to return to the globe.
7. Verify offline posture with Playwright e2e asserting zero external network requests during globe render and walk draw.
8. Optional: PMTiles packaging only after the offline globe evidence gate passes.

### Acceptance
- A real corpus walk renders on the globe fully offline (Playwright trace shows zero external requests), place-to-place flight works, and the flat-map detail view opens from a globe click.
- `pnpm vitest run` green for geography + canvas; Playwright e2e green for Places; typecheck clean.

## Task 3: Movement streams — geography edges with provenance

**Source:** GitHub issue #19.  
**Blocked by:** #18.  
**Blocks:** none directly (surface feature).

### Goal
Add surface-layer `geography_edge` records for flight/shipping/overland/inland-water routes, seeded from the corpus with passage-level provenance, rendered as arcs on the globe.

### Steps
1. Add `geography_edge` schema in `packages/schema` with fields: `id` (UUIDv4), `profileScope`, `mode`, `sourcePlaceId`, `targetPlaceId`, `label`, `timeWindow`, `geometry` (GeoJSON LineString WGS84), `provenance`, `seedKey`. Add validation tests with real records.
2. Add SQLite migration and Rust repository in `apps/desktop/src-tauri/src/db/repositories/`; add CRUD round-trip tests against a real temp database (`--test-threads=1`).
3. Implement great-circle geometry computation with control-point override.
4. Seed real lanes from the corpus: VOC Amsterdam→Banda shipping; Rhodes's Oxford journeys (overland); Rudolf II's Prague court movements; Cult of Reason Paris events. Each lane must resolve to real located places and real passages; seed fails loudly if provenance or place is missing.
5. Render lanes on the globe with mode styling and temporal filtering via the Places surface.
6. Add provenance drill-down from a lane click.

### Acceptance
- Every seeded lane resolves to real located places and real corpus passages; rendering and temporal filtering are tested with real graph data.
- `cargo test` (`--test-threads=1`) and `pnpm vitest run` green; Playwright e2e shows seeded lanes on the globe.

## Task 4: Agentic asset gathering — agent skills in the background tmux session

**Source:** GitHub issue #20.  
**Blocked by:** #18.  
**Blocks:** none directly (enables real imagery).

### Goal
Allow agents to gather imagery through a documented skill running in the existing background tmux session, with a deterministic `rc-asset ingest` validation gate.

### Steps
1. Write `docs/agents/asset-fetching.md`: skill spec for intelligent source/image selection, acceptable licenses (CC0/CC BY/public domain first), reporting format, and gate-rejection handling.
2. Document the background tmux session contract: app starts/attaches the session; agents run the skill inside it; results are announced back into the session.
3. Implement `rc-asset ingest` command/CLI with validation gate: mime sniffing, byte-size cap, license/source capture, content-addressed import into the media store, and street-view store registration.
4. Wire the existing local redaction pipeline (pending → detected/manual → redacted derived; raw bytes untouched).
5. Implement place/walk/scene association with a provenance record matching the fetch-record contract.
6. Add gate unit tests with real image files (valid/invalid mime, oversize, missing license).

### Acceptance
- One documented end-to-end run: an agent in the background tmux session gathers a real CC-licensed image; `rc-asset ingest` validates it; it lands in the street-view store, is redacted locally, and appears associated with a place in a walk.
- Rust + frontend suites green; typecheck clean.

## Task 5: Stories reframe — agnostic journeys, media-first scenes

**Source:** GitHub issue #21.  
**Blocked by:** #18.  
**Blocks:** #22.

### Goal
Stop claiming migration. The story surface becomes an agnostic journey over located events; media and map/street data become first-class scene content.

### Steps
1. Sweep visible strings across the UI shell, story lens, seed (`seedMigrationStory.ts`), exporter output, and public viewer; replace migration-only claims with neutral journey language. The visible label becomes "Journeys"; internal `migration` profile-scope key stays untouched for data compatibility.
2. Rewrite the seed narrative agnostically using real corpus content; re-seed idempotently.
3. Update scene rendering to include the place's redacted street-view imagery and its map/globe walk context alongside existing passage media.
4. Add tests asserting no migration-only claims in visible strings, seed integrity, and media + imagery rendering in a story scene with real data.
5. Keep consent/redaction/language suites green.

### Acceptance
- A story scene renders its media and its place imagery end to end; a wording sweep passes with tests; the keepsake export contains no migration-only claims; consent/language behavior unchanged.
- `pnpm vitest run` and Playwright story e2e green; typecheck clean.

## Task 6: Constellation ingestion — QL-organised constellations from sources and agent chats

**Source:** GitHub issue #27.  
**Blocked by:** #24.  
**Blocks:** #22, #28.

### Goal
Turn raw sources and agent-chat output into QL-organised constellations (episode/document/conceptual) with flexible shapes and an `ENCAPSULATES` substrate relation.

### Steps
1. Add constellation schema: `kind` (`episode`/`document`/`conceptual`), metadata (time, place, QL, file refs, content), assembly provenance (agent-parse vs construct), curation events. Add validation tests with real records.
2. Implement ingestion path: raw source → QL/MEF parse → derived constellation with passage-level provenance; raw corpus remains immutable.
3. Document the agent-chat ingestion seam: terminal/tmux session, skill packages, lifecycle hooks; harness-agnostic so Claude Code, Codex, ai-kit, or a custom harness can drive the same surface.
4. Validate flexible constellation shapes (dyad/triad/quaternity/4+2/nested); do not force a rigid six-slot schema.
5. Add the one deliberate substrate relation `ENCAPSULATES` (container → member) with `mode`: `outgoing` (0/1, bimba) and `ingoing` (1/0, pratibimba). Add acyclicity validation and recursive inclusion tests.
6. Implement encapsulation round-trip through the real graph store: constellation → node → included in parent → unfold back.

### Acceptance
- Real sources and real agent chat output produce episode/document/conceptual constellations with correct provenance; a constellation encapsulates as a node into a parent and unfolds back with data intact, tested against the real graph store (no mocks).
- `pnpm vitest run` + Rust suites green; typecheck clean.

## Task 7: Palace 3D — a real spatial memory place

**Source:** GitHub issue #22.  
**Blocked by:** #21 and #27.  
**Blocks:** #23.

### Goal
Replace the card-list `PalaceLens` with a real 3D spatial memory place: rooms, placeable objects, wall fixtures, collections, constellation objects, QL 6+6' tacit structure for the bootstrapping profile, and encapsulation-driven object compression.

### Steps
1. Add `@react-three/fiber@9` and `three.js` dependencies with local assets only (no CDN). Implement `PalaceRenderer` mirroring `MapSurfaceRenderer`: pure scene-building/layout logic that is unit-tested; WebGL mount verified by Playwright e2e asserting real rendered frames. Add WebGL2 capability probe with a clear error state.
2. Implement deterministic room generation from real chamber clustering: floor, walls, doorways, corridors, anchored to clusters. Unit-test the geometry/layout logic.
3. Implement object palette and placement: events, places, images, story scenes become placeable objects; placement (position/rotation/scale on floor, plinth, or fixture) persists in the SQLite layout store. Placement is curation, never a graph write.
4. Implement wall fixtures (image frames, text panels, title plaques) on named six faces, derived from graph content and curated.
5. Implement collections (shelves/alcoves) derived from graph structure and curatable.
6. Implement constellation objects: chamber subgraph (nodes + real graph edges) laid out in 3D with a seeded spring/force layout, walkable and inspectable.
7. For the bootstrapping profile, implement QL 6+6' room shaping: six interior faces map to P0–P5 (members placed by QL resonance); exterior conjugate faces on the room-as-object; inside/outside entry behavior. Other profiles get neutral cube rooms.
8. Implement encapsulation objectification: compressed constellation → single palace object; enter unfolds (0/1) into internal constellation; exit compresses (1/0); partial constellations become faithful partial architecture (alcove/corridor/wall section).
9. Implement first-person navigation (WASD/pointer) + fly-to (room/object) + embodied guided recall over the curated palace walk, reusing scene-sequence machinery. Recall walks the encapsulation tree, compressing/expanding between scales.
10. Implement palace serialization and exporter integration so the public viewer renders the palace offline.
11. Remove the old card-list `PalaceLens` implementation.
12. Add scene-graph/layout unit tests and Playwright WebGL e2e with real graph data.

### Acceptance
- A navigable palace generated from a real graph: real objects on walls, a real collection, a real constellation object, persisted curation, embodied guided recall, and an export that opens in the public viewer — verified by real tests.
- Bootstrapping profile tests verify QL 6+6' structure; other profiles assert neutral rooms.
- Encapsulation object enters/unfolds and exits/compresses with data intact.
- Frontend + Rust suites green; typecheck clean; e2e recorded in the closing comment.

## Task 8: Timeline dynamic query — relational depth on demand, global/temporal walk

**Source:** GitHub issue #28.  
**Blocked by:** #27.  
**Blocks:** none.

### Goal
Make the timeline a lazy relational query surface with a working-set stack, then compose it into a global/temporal walk with subtimelines mapped in place.

### Steps
1. Implement `expandNode(nodeId)` contract returning edges + neighbours with full properties via the real graph store.
2. Implement working-set stack: add/remove clicked nodes and edges; surface deep edge properties (provenance, precision, role, mode, temporal bounds).
3. Keep the timeline base view unchanged for dated events; expansion is opt-in per click.
4. Compose the global/temporal walk over the timeline: traversable sequence of located, dated events across the project.
5. Implement subtimeline frames mapped in place: any node can frame a sub-timeline (place history, figure life, event causes) nested inside the walk; Earth remains the spatial zero-case.
6. Add tests using real graph data: expansion loads real relational depth, stacking/unstacking, subtimeline in-place mapping.

### Acceptance
- With a real graph, clicking a node loads its real edges and neighbour data into a stack, deep properties surface, and the timeline stays light; a global/temporal walk traverses dated located events with subtimelines mapped in place.
- `pnpm vitest run` + Rust suites green; Playwright timeline e2e green; typecheck clean.

## Task 9: Canvas pipeline redesign — one visible sequence

**Source:** GitHub issue #23.  
**Blocked by:** #22.  **Blocks:** #25.

### Goal
Turn the five lenses into a visible pipeline: Constellations → Timeline → Places → Stories → Palace, with per-object send-to actions and a flow view.

### Steps
1. Replace the peer-tab shell pattern with a pipeline rail component and lens switching.
2. Add stage-state model tracking each object's position through the pipeline stages.
3. Implement send-to actions through real transport seams:
   - "Send to timeline" → create/update timeline layout.
   - "Locate" → assign a Temporal Place.
   - "Add to story" → create a scene.
   - "Place in palace" → place object in a room.
4. Implement flow view: select an object and see its passage through the stages, with jumps into each stage surface.
5. Update existing lens tests for the rail; add e2e covering the full pipeline sequence with real data.

### Acceptance
- An object is pushed through the full pipeline (constellation → timeline → places → story → palace) with real data and is visible at each stage, verified end to end.
- `pnpm vitest run` + Playwright e2e green; typecheck clean.

## Task 10: Left sidebar harmonization — projects layer into icons and surfaces

**Source:** GitHub issue #25.  
**Blocked by:** #23 and #24.  **Blocks:** none.

### Goal
Add a proper projects layer at the top of the left rail; selecting a project routes into existing icons and surfaces, consistent with the pipeline rail.

### Steps
1. Add projects layer component in the left rail (project picker + project state) routing into surfaces.
2. Scope the existing icon rail (files/search/sequences/annotations/inspector/settings/terminal) to the active project; keep active-surface state consistent with the pipeline rail.
3. Make left overlay modes (files/search/annotations) project-scoped with informative empty states for missing project/profile selection.
4. Preserve existing navigation behavior (constellations tree, browser modes) or improve it without breaking it.
5. Add tests: project selection drives every left-rail surface with real data; e2e covers project → surface routing.
6. Update existing shell tests for the rail; keep suites green.

### Acceptance
- Project selection drives every left-rail surface with real data; rail and sidebar agree on the active surface; e2e covers project → surface routing.
- `pnpm vitest run` + Playwright e2e green; typecheck clean.

## Task 11: Data-layer hardening — clean layers as refinement-2 lands

**Source:** GitHub issue #26.  **Blocked by:** #24.  **Blocks:** none.

### Goal
Audit and clean the data layers as the new stores land: clear substrate/profile/presentation ownership, remove dead code, verify migration hygiene, and add boundary tests.

### Steps
1. Write a data-layer audit doc covering schema ownership, store boundaries, and dead-code inventory across substrate/profile/presentation.
2. Remove dead code: old palace card list (now replaced by Task 7), stale migration-framed seed strings (after Task 5), orphaned schema/commands from new stores.
3. Add boundary tests: no frontend direct DB access; joins only at the repository layer; each new store has one repository.
4. Verify migration hygiene on an existing workspace: no re-runs, idempotent seeds.
5. Keep full suites green (frontend, Rust `--test-threads=1`, e2e).

### Acceptance
- The audit doc lands with boundary tests; dead code from superseded implementations is gone; migration hygiene verified on a real existing workspace; full suites green.
- `pnpm vitest run` + `cargo test` (`--test-threads=1`) + Playwright e2e green; typecheck clean.
