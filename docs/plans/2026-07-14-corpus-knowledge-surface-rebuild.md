# Corpus Knowledge Surface Rebuild Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` and `superpowers:test-driven-development` task-by-task. Changes integrate on `main` with the user's explicit consent; preserve unrelated uncommitted terminal/workspace-root changes.

**Goal:** Make the canvas, timeline, reader, Explorer, and file ingestion one evidence-rich knowledge surface backed by a single local-first graph/document/media contract, then populate it from the Episode 1/2 and chat-log corpus.

**Architecture:** A graph node owns identity, typed narrative/temporal/QL metadata, relationships, and a single authoritative reading document. SQLite remains the local operational source for documents, relations, timeline projection, search, and media manifests; remote graph sync is a projection, never the only place a relationship exists. Canvas and timeline only hold presentation/layout state. Corpus compilation emits deterministic node/document/relation mutations with source coordinates; it never overwrites a newer user-authored document.

**Tech Stack:** React 19, TypeScript, Zustand, React Flow, Tauri v2, Rust, SQLite, BlockNote, Vitest/Testing Library, Rust integration tests.

## Invariants

1. A card exposes title, pith, semantic palette, optional thumbnail, and compact metadata only. Deep text is reader-only.
2. `GraphNode`, reader body, inspector metadata, media attachment, source reference, and timeline projection resolve by the same `graphNodeId`.
3. Timeline is a first-class workspace lens. It may render a temporal Constellation expression card, but never becomes a constellation/canvas.
4. Mythic status, historical evidence, claim mode, temporal placement, geography, QL structure, and archetypal resonance are independent typed fields.
5. A resource drop either commits a complete durable node/document/source mutation or creates nothing; background best-effort graph writes cannot create a half-node.
6. All Episode 1/2 and chat-log files are eligible source material. Every imported assertion retains source coordinates and is labelled by its evidentiary/interpretive status rather than silently promoted or excluded.
7. Search and link selection operate over the active workspace plus attached resource roots, with a deterministic fresh index and no hidden requirement to run an agent command first.

## Task 1: Establish a local relationship and reader-document projection

**Files:**
- Modify: `apps/desktop/src-tauri/src/db/repositories/{graph_metadata.rs,node_document.rs}`
- Create: `apps/desktop/src-tauri/src/db/repositories/node_relationship.rs`
- Modify: `apps/desktop/src-tauri/src/db/connection.rs`, `apps/desktop/src-tauri/src/commands/{graph.rs,timeline.rs}`
- Modify: `packages/desktop-api/src/{graph.ts,index.ts}`
- Test: Rust repository/command integration tests using a temporary SQLite workspace

1. Write a failing SQLite integration test that creates two local graph metadata records and one typed relationship, reloads the workspace, and proves the relationship survives with source coordinates/properties.
2. Add a local relationship repository and schema migration. Use graph-node IDs, a typed relation kind, JSON properties, timestamps, and idempotent merge semantics.
3. Write a failing test that opens the same graph node from a canvas and the timeline after a reader-body mutation and receives the identical new revision.
4. Make `node_document` the canonical reader document projection; make graph reads join the local document rather than letting a direct graph snapshot bypass the local revision.
5. Test the migration against a pre-existing database and a fresh bootstrap; verify no user-authored document is replaced.

## Task 2: Replace ad-hoc reader media and source mutations with one attachment model

**Files:**
- Create: `apps/desktop/src-tauri/src/db/repositories/node_attachment.rs`
- Modify: `apps/desktop/src-tauri/src/commands/graph.rs`, `apps/desktop/src-tauri/src/lib.rs`
- Modify: `packages/desktop-api/src/{graph.ts,index.ts}`
- Modify: `packages/canvas/src/content/{contentBlocks.ts,contentLinkingActions.ts}`
- Modify: `apps/desktop/src/features/{canvas/insertMedia.tsx,viewer/GraphDocumentContent.tsx,viewer/NodeReaderBody.tsx,viewer/ReaderSurface.tsx,inspector/InspectorTab.tsx}`
- Test: native temporary-workspace media import/read test; React reader mutation-refresh test

1. Write a failing native test: image selection imports bytes, creates a portable attachment row, appends a structured image block, and resolves after restart.
2. Add attachment records (`node_id`, portable path, media kind, MIME type, title/caption, source path, provenance, timestamps) and return them with graph/reader records.
3. Replace the current `importNodeImage`-as-generic-file API with explicit image and file attachment operations, each preserving a structured attachment block.
4. Wire reader action completion through a single record refresh/invalidation path shared by canvas, timeline, fullscreen reader, and inspector thumbnail selection.
5. Test a real attachment appears in the reader and can be selected as a card thumbnail without duplicating its storage or creating a `blob:` reference.

## Task 3: Make file-to-canvas ingestion atomic and semantically useful

**Files:**
- Create: `apps/desktop/src/features/canvas/resourceIngestion.ts`
- Modify: `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx`
- Modify: `apps/desktop/src-tauri/src/commands/{constellations.rs,graph.rs}`
- Modify: `packages/canvas/src/{CanvasView.tsx,state/canvasStore.ts}`
- Test: `apps/desktop/src/features/canvas/resourceIngestion.test.ts`; native SQLite ingestion test

1. Write a failing integration test that drags a Markdown file from an attached folder onto canvas and expects one persisted resource card with filename title, derived pith, typed resource/source metadata, and a readable source-derived body.
2. Add a backend ingestion command that classifies a file, registers an attached root if needed, creates the canonical node/document/source link, and writes the canvas placement in one transaction.
3. Implement deterministic extractors: Markdown title/first meaningful paragraph; image filename/metadata; PDF/text filename plus extracted preview where available. Do not fabricate content.
4. Replace local-first/background graph creation in both file-drop paths with the atomic command and rehydrate the returned node.
5. Test persistence after app restart and failure rollback when the source file cannot be read.

## Task 4: Build semantic taxonomy, QL labels, place, myth, source, and thinker support

**Files:**
- Modify: `packages/schema/src/node.ts`, `packages/desktop-api/src/graph.ts`
- Modify: `apps/desktop/src-tauri/src/db/repositories/{graph.rs,graph_metadata.rs}`
- Create: `packages/canvas/src/presentation/semanticMetadata.ts`
- Modify: `packages/canvas/src/{presentation/cardPresentation.ts,timeline/categories.ts}`
- Modify: `apps/desktop/src/features/{inspector/InspectorTab.tsx,viewer/ReaderSurface.tsx}`
- Test: schema, palette/category, inspector and Rust metadata round-trip tests

1. Write failing tests for descriptive QL labels (for example “Complete sixfold · Day arc”), explicit QL unit title, geographic labels, and a Myth temporal record classified as `myth-in-time` only when its entity/historicity/temporal role all qualify.
2. Add controlled source subtype and entity support needed for `Thinker`, `MythicImage`, `Source`, `Place`, and a typed constellation-expression relation. Preserve existing IDs and treat unknown legacy values as visible `unclassified`, not “long form document.”
3. Move geography from an overloaded string-tag convention into typed places plus optional `LOCATED_AT` relationships, retaining compatible `place:` projections for existing readers/search.
4. Create one frontend semantic-label registry used by cards, timeline legend, reader, and inspector. It must never display raw enum slugs as the primary meaning.
5. Add migration/audit tests that prove documented historical records cannot become myths or speculation merely because of resonance or an attached interpretive link.

## Task 5: Restore timeline relation projection and create first-class lanes/LOD

**Files:**
- Modify: `apps/desktop/src-tauri/src/commands/timeline.rs`
- Modify: `packages/canvas/src/timeline/{contracts.ts,TimelineLens.tsx,timelineStore.ts,categories.ts}`
- Modify: `apps/desktop/src/features/timeline/createTimelineDataSource.ts`
- Test: Rust timeline-command integration test; `TimelineLens` rendered interaction tests

1. Write a failing offline SQLite test for two temporal nodes joined by a local relationship; load the timeline and expect that relationship in the returned view.
2. Project local relationships into the timeline; merge remote links only as a synchronisation enhancement, deduplicated by relationship ID.
3. Add lanes/filters for documented history, claims/interpretations, myths in time, sources/thinkers, and constellation expressions. A temporal constellation card links to its source constellation and uses `EXPRESSES`/`INSTANTIATES` relations rather than becoming a timeline container.
4. Make relation rendering LOD-aware: overview shows temporal markers/edge aggregates, medium scale shows pith and key semantic links, reading scale shows full cards and relation labels. Preserve user card geometry and vertical drag layout.
5. Test initial camera, persisted vertical layouts, temporal links, keyboard scrolling, and double-click reader parity against a real timeline payload.

## Task 6: Compile corpus detail and link health deterministically

**Files:**
- Create: `scripts/compile-corpus-knowledge.mjs`, `scripts/audit-corpus-knowledge.mjs`
- Create: `antichrist-vault/knowledge-manifest.yaml`
- Modify: `apps/desktop/src-tauri/src/db/root_archetypal_seed.rs` or replace its generic body builder with compiler output
- Test: fixture corpus compiler tests and a SQLite application test

1. Write a failing fixture test that parses headings, Markdown links, aliases, source paths, quoted/nearby passages, and metadata from Episode-style files into deterministic node/document/relation candidates.
2. Create a source manifest covering Episode 1 QL units, Episode 2 timeline/reports, scripts, and chat logs. All are included in the pool; the manifest names the source role and coordinate strategy instead of filtering any class out.
3. Compile pith, deep body sections, source coordinates, wikilinks/backlinks, semantic tags, QL positions, temporal/place candidates, and extraction diagnostics. Preserve quotations/attribution; mark inferred connections explicitly.
4. Replace `body_for()`’s generic template with source-derived, structured reader documents. Never overwrite a newer `user_authored` revision.
5. Produce health reports for unlinked files, unresolved/ambiguous links, orphan nodes, shallow bodies, missing time/place, unresolved media, and metadata conflicts. Gate seed changes on those reports.

## Task 7: Seed actual myth, thinker/source, temporal constellation-expression records, and links

**Files:**
- Modify: compiler manifest/output and `apps/desktop/src-tauri/src/db/root_archetypal_seed.rs`
- Test: root seed integration tests against checked-in corpus coordinates

1. Add failing tests asserting the seed contains source-derived MythicImage/Myth, Thinker, Source, and Place records where the corpus supports them; every record must retain exact source coordinates.
2. Materialise initial bounded sets from corpus candidates: QL mythic figures/images, named thinkers and cited sources, Episode 2 temporal entities, and historical-event-to-archetypal/constellation expression links.
3. Map time and place only where the source supports a placement; map a myth’s origin/attestation as `myth_located_at`, not a historical event’s resonance.
4. Seed `EXPRESSES`, `INSTANTIATES`, `SOURCED_FROM`, `NESTS`, `PART_OF`, and `LOCATED_AT` links with provenance properties. Do not infer causality from adjacency.
5. Test that every initial generated record has a deep body beyond the pith, valid source coordinate, and one or more meaningful links where its type requires one.

## Task 8: Rebuild top navigation, Explorer search, and link selection

**Files:**
- Modify: `apps/desktop/src/layout/{TransportBar.tsx,CanvasPane.tsx,CanvasTabs.tsx,Shell.tsx,LeftOverlay.tsx,observatory.css}`
- Modify: `apps/desktop/src/features/search/{SearchPanel.tsx,CommandPalette.tsx}`
- Modify: `apps/desktop/src/features/canvas/{LinkFilePicker.tsx,WorkspaceFilePickerButton.tsx}`
- Modify: `packages/canvas/src/components/FuzzyFilePicker.tsx`
- Modify: `apps/desktop/src-tauri/src/commands/{search.rs,constellations.rs}`
- Test: real SQLite search index test; rendered navigation/link-picker tests

1. Write a failing UI test that the canvas tab strip is inside the transport bar beside Canvas/Timeline and does not overlap canvas coordinates.
2. Move tab ownership to top chrome; preserve tab-local viewports and make tabs keyboard accessible with explicit close affordances for non-root tabs.
3. Write a failing native test that bootstrapping and attaching a root rebuilds/searches its files and documents without a separate command.
4. Rebuild/incrementally invalidate the index on bootstrap, root attachment, document mutation, ingestion, and constellation switch. Search titles, piths, reader text, source paths, tags, and attached-root files.
5. Replace fixed-position `FuzzyFilePicker` with an anchored, keyboard-navigable command surface supporting full relative path search, current-root context, type filters, and a link/attach/create intent.
6. Implement Explorer hover grace, focus retention, explicit pinned mode, and automatic pointer-leave close. Ensure portal pickers count as browser surfaces while open.

## Task 9: Unify card presentation and verify actual application behaviour

**Files:**
- Modify: `packages/canvas/src/{CanvasView.tsx,nodes/*.tsx,presentation/cardPresentation.ts}`
- Modify: `apps/desktop/src/features/{inspector/InspectorTab.tsx,viewer/*}`
- Create/modify: desktop E2E tests and native Tauri integration tests

1. Write a rendered test covering resource, note, portal, timeline, and constellation-expression cards using the same title/pith/palette/media resolver.
2. Remove remaining wrapper-level visual ownership so resize, palette, thumbnail, and LOD act on one card surface.
3. Verify inspector changes propagate to canvas and timeline card views through canonical metadata/style mutations.
4. Run real desktop workflows: attach folder → search → link file → drag file to canvas → add image → restart → open canvas/timeline reader → inspect backlink/time/place/QL metadata.
5. Run `pnpm test`, desktop build, targeted Rust integration tests, corpus audit, and an actual Tauri launch. Commit only tested, coherent increments; never stage the user’s unrelated terminal/workspace-root changes.
