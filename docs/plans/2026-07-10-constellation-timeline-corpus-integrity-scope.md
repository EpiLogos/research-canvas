# Constellation, Timeline, and Corpus Integrity Scope Specification

**Date:** 2026-07-10
**Status:** Audit complete; scope proposed for validation before implementation
**Owner:** Antichrist Project
**Purpose:** Define the repository-wide remediation and enrichment programme required to make constellations, the timeline, node reading content, QL metadata, links, evidence tags, and geography coherent and production-ready.

## 1. Outcome

The requested work is not a seed-file tidy-up. It is a coordinated repair of the domain model, runtime data flow, corpus compiler, historical-evidence taxonomy, and rendered interaction model.

The target system must provide:

1. A first-class timeline that projects temporal graph nodes independently of whichever constellation is open.
2. First-class, reusable constellations that can contain nodes and references to other constellations, including shared references from multiple higher-order constellations.
3. A single visible canvas card surface whose colour and dimensions persist without an outer grey/group wrapper.
4. Two intentionally different content layers for every substantive node:
   - a pithy `summary` for the canvas/timeline face;
   - a source-derived `body` for the double-click reading view.
5. Typed QL metadata for structures that genuinely follow a QL form, with complete units distinguished from partial positional maps, quaternities, and topological composites.
6. Resolvable wikilinks and graph references, with health reports for broken, ambiguous, and orphaned links.
7. Orthogonal historical, evidentiary, mythic, interpretive, temporal, and geographic metadata. A documented event must not become “myth in time” merely because it has archetypal resonance.
8. A repeatable corpus build/migration process that never silently loses user-authored reading content.
9. Real end-to-end verification against SQLite plus Neo4j and the rendered app. Critical tests may not pass by mocking the transport or silently skipping when Neo4j is absent.

## 2. Non-negotiable domain rules

These rules are the architectural ground for every workstream.

### 2.1 Timeline is not a constellation

- Timeline is a first-class lens/surface over all eligible temporal nodes.
- Timeline loading must not accept or depend on an active constellation/canvas ID.
- A Historical Forms constellation may reference temporal nodes, but it is not the timeline and does not determine timeline membership.
- A temporal node is the same graph node wherever it appears. Canvas, timeline, search, and reading views do not create copies.
- Timeline presentation state has its own persistence boundary. It must not be hidden in an arbitrary constellation canvas layout row.

### 2.2 Constellations are reusable semantic compositions

- A constellation is a durable domain object with stable identity, metadata, membership, and a primary canvas surface.
- A portal/reference card targets a `constellationId`, not merely a `canvasId` stored in opaque style JSON.
- A constellation can be referenced from multiple other constellations. Composition is therefore a directed graph/DAG, not merely a SQL ownership tree.
- Opening a portal resolves the target constellation’s primary canvas; canvas identity remains presentation detail.
- Membership, semantic resonance, QL position, and portal reference are different relations and must not all be encoded as `RESONATES_WITH`.

### 2.3 Face copy and reading content have different jobs

- `title`: stable human-readable identity.
- `summary`: pithy face copy used on canvas/timeline/search. It must be concise, specific, and readable without opening the node.
- `body`: substantial reading document used by the double-click reading view. It must be source-derived, not a repetition of the summary plus generic directions.
- Source/provenance, evidence limits, temporal/geographic context, and QL role belong in the body and typed metadata, not crammed into the face.

### 2.4 Evidence, myth, and interpretation are orthogonal

- `documented` describes evidentiary support.
- `historical`, `mythic`, `literary`, and `theoretical` describe what kind of thing is represented.
- `interpretation`, `allegation`, `hypothesis`, and `symbolic_parallel` describe claim mode.
- A historical event can be documented and also connected to an archetype. The connection does not turn the event itself into a myth.
- “Myth in time” is reserved for an actual myth, ritual narrative, or mythic complex being temporally located.
- “Contested” is not a synonym for “speculation”; an event can be documented while a causal interpretation of it remains contested.
- A `Source` is an evidentiary object; a `Claim` is an assertion. They must not remain conflated as `Source` plus `sourceKind = claim`.

## 3. Audit method and evidence base

The scope was derived from a read-only audit of:

- recent commits and regression lineage, especially `e24114a`, `64125ce`, `7ae04c8`, and `dc8d5f6`;
- the desktop TypeScript, Rust, SQLite migrations, Neo4j repositories, static transport, exporter, and tests;
- the running local browser preview and live SQLite/Neo4j state;
- current architecture and data-model documents;
- current episode scripts, large chat logs, handovers, archive versions, QL units, Episode 2 timeline ledgers, nine Episode 2 research reports, the Antichrist Book, and top-level supporting research;
- repository wikilinks, source coordinates, evidence tags, temporal fields, and place strings.

Focused verification performed during the audit:

- The browser rendered the 18 root portal cards inside visible outer grey/group frames.
- Switching from that root canvas to Timeline rendered `No temporal nodes loaded`.
- Thirty-five focused frontend tests passed even though the user-visible failure reproduced.
- Selected Rust tests reported passing, but the graph-critical tests returned early when `NEO4J_TEST_URI` was absent.
- The live Neo4j database contained 105 `TheoryNode`s: 49 production-root nodes, 53 leaked `test-root-field-*` nodes, and 3 other test nodes.

The audit’s corpus snapshot covered 147 markdown/JSON/YAML/CSV content artifacts under the episode/vault surfaces before media. The main source segments include:

| Segment | Scale | Current role |
| --- | ---: | --- |
| Episode 1/1.1 QL sources | 15 files; 2,569 lines; 808 wikilinks | Deepest project-specific QL source |
| Episode 2 research | 9 reports; about 344 KB | Historical synthesis and claim qualification |
| Large chats/handover | 3 files; 2,195 lines; about 676 KB | Generative provenance, not settled canon |
| Current episode scripts | 3 files; 1,328 lines | Current editorial/narrative layer |
| Episode planning/version archive | 17 Episode 1 files plus Episode 2 legacy drafts | Superseded branches and recoverable material |
| Timeline/resonance ledgers | 408 lines; 80 Episode 2 timeline rows | Graph preparation/index layer |
| Top-level supporting research | 12 files; 11,659 lines | Large research reservoir |
| Antichrist Book | about 215 KB | Primary creative/theoretical source |

## 4. Confirmed current-state failures

### 4.1 Timeline is structurally coupled to the active canvas — critical

The failure is deterministic:

1. `apps/desktop/src/layout/Shell.tsx:39-45` builds the timeline data source with `workspace.canvasId`.
2. `apps/desktop/src/features/timeline/createTimelineDataSource.ts:20-28` calls `loadCanvasView({ canvasId, lens: "timeline" })`.
3. `apps/desktop/src-tauri/src/db/canvas_service.rs:79-145` loads only that canvas’s SQLite layout rows, joins only their graph IDs, then filters them by `is_temporal`.
4. Startup selects the root portal canvas, which contains only non-temporal portal layouts.

The global temporal graph query still exists in `apps/desktop/src-tauri/src/db/repositories/graph.rs:462-478`; the desktop timeline path no longer uses it.

This coupling also affects:

- double-click reading, because `ReadingLens` resolves selection only from current canvas nodes;
- colour/size updates, because timeline updates write through the active canvas store;
- layout persistence, because timeline geometry is stored in `node_layout.style.__timelineCard` for an arbitrary canvas.

### 4.2 Production creates layouts without reliably creating graph substance — critical

`seed_root_archetypal_field()` is the only current function that upserts the full theory nodes and temporal metadata into Neo4j. It has no production caller. Runtime bootstrap calls only the layout/workspace ensure function.

The consequences are:

- root and child canvas layouts may point to absent graph nodes;
- fallback synthesis forces `is_temporal = false`;
- the timeline can remain empty even when the Historical Forms canvas exists;
- the live graph can remain on an older 49-node seed while the checked-in Rust seed declares 121 nodes.

### 4.3 The current constellation hierarchy is canvas nesting, not first-class constellation composition — critical

Current code uses “constellation” to mean three different things:

1. one row in the legacy `projects` SQLite table;
2. a Neo4j `Constellation` graph node;
3. a child canvas referenced by a portal sidecar.

The seeded runtime currently has one SQL domain row and 19 canvases attached to it. The 18 named child “constellations” are canvases, not child constellation records. Portals contain `targetCanvasId`, not `targetConstellationId`. Opening a portal swaps canvases while retaining the same active domain object.

This permits a visual imitation of nesting, but not referential integrity, reusable multi-parent composition, or clean ownership.

### 4.4 QL metadata is marker-level and corruptible — critical

The graph currently identifies a QL structure through a loose combination of:

- `sourceKind = "ql-unit"`;
- `ql_unit` evidence tag;
- one or more generic `#0`–`#5` strings in `sourceCoordinates`;
- `constellationKind` inside layout style JSON.

There are no typed fields for QL form, unit identity, arc, topology, member position/order, completeness, complementary position, traversal, or membership provenance.

The audited live production-root graph still contained zero `Constellation` nodes and zero QL-unit source kinds/tags, confirming that the newer declarations had not reached production substance.

The offline fallback path also drops `constellationKind`. TypeScript then defaults a portal to `standard`, and the next layout flush can overwrite `ql-unit`. The live SQLite database contained this exact corruption on root portals.

### 4.5 Canvas portal/cards render as a card inside a second visible box — high

The visible regression originates in the duplicated wrapper/resizer structure around the actual surface:

- `packages/canvas/src/nodes/NoteNode.tsx`
- `packages/canvas/src/nodes/ResourceNode.tsx`
- `packages/canvas/src/nodes/GroupNode.tsx`
- `packages/canvas/src/nodes/AdaptiveNode.tsx`

The semantic/render type `group` also inherits React Flow group-wrapper behaviour. Full-size inline sizing on `AdaptiveNode` conflicts with intended dot/pill/card CSS. A zoomed-out portal can therefore retain a card-sized outer hitbox even when its visible mode is supposed to be a dot.

### 4.6 Reading bodies are generic and reseeding can erase authored detail — critical

The checked-in seed declares 121 nodes, and all 121 have non-empty summaries. However, every body is generated by one `body_for()` template containing title, the same summary, and generic directions. Custom deep-reading coverage is effectively 0/121.

Worse, `GraphRepository::upsert_seed_node` unconditionally replaces `n.body`. If deep reading documents are authored before content ownership/versioning is fixed, a later seed can erase them.

The app also has two body stores:

- Neo4j `GraphNode.body`;
- SQLite `node_document`, which is authoritative-local-first for editing.

The seed/reconcile contract does not yet safely define which source owns which revision.

### 4.7 Historical category derivation deterministically mislabels verified events — critical

`packages/canvas/src/timeline/categories.ts:54` returns `myth-in-time` for every `Event` with any `archetypalResonance`.

The seed sets `archetypal_resonance = summary` for every seeded node. Therefore every factual Event is eligible to render as “Myth in time.” In the audited live production root, all nine Events would be categorized this way, including seven explicitly tagged `documented`.

The same classifier collapses “contested” and “speculation” into one visual bucket. Claim nodes are temporal and enter the same projection as occurred events without an explicit temporal role or claim lane.

### 4.8 Geography exists in the corpus but not in the graph — high

The Episode 2 ledger has a Places column on all 80 rows and contains 78 raw place strings plus a core place list. The live graph has:

- zero `Place` nodes;
- zero `LOCATED_AT` relations;
- no structured geographic fields on `GraphNode`.

### 4.9 Wikilinks are rich in the QL corpus but absent from the application model — high

The audited core corpus contains 812 wikilinks with no genuinely unresolved target after escaped aliases are parsed correctly. However:

- 162 basename-only references are ambiguous because duplicate Epi-Logos/episode copies exist;
- the app has no wikilink parser, resolver, backlink index, or broken-link report;
- all nine Episode 2 reports have zero wikilinks, URLs, or footnotes;
- source coordinates are file-level, not heading/claim-level;
- fourteen checked-in QL seed paths omit `/ep-1.1/` and point to files that do not exist;
- current tests check only a path prefix, not target existence.

### 4.10 Metadata contracts disagree across TypeScript and Rust — high

TypeScript advertises `evidenceTags` and `sourceKind` in `GraphNodePatch`. Rust’s `GraphNodePatch` omits both. The UI/transport can therefore promise a metadata edit that the backend cannot persist.

No frontmatter contract exists across the 67 core content markdown files outside embedded plugin/compiler content. Naming drifts between singular/plural evidence fields and `ql-unit`/`ql_unit` values.

### 4.11 Tests and live data create false confidence — critical

- Timeline tests mock a temporal node already present on `c1`; they do not prove runtime bootstrap can supply global temporal nodes.
- Graph integration tests return early when Neo4j is not configured and still report a passing test.
- Tests use the configured development database; cleanup happens only at successful function end. The audited live database contained 53 leaked `test-root-field-*` nodes.
- Pure seed tests check in-memory declarations but not production invocation, source existence, offline fallback, or user-visible rendering.

## 5. Approaches considered

### Approach A — Patch the visible regressions only

Change the timeline query, override the grey wrapper CSS, rename a few categories, and bulk-edit current tags.

**Advantage:** fastest visible improvement.
**Failure:** leaves fake constellation identity, generic bodies, dead production seed, body clobbering, missing geography, unresolved application wikilinks, and false-green tests. Future agents would recreate the same failures.

### Approach B — Contract-first repair plus staged corpus compilation — recommended

First establish the correct timeline, constellation, content ownership, QL, evidence, link, and geography contracts. Then migrate/runtime-wire them. Only after those contracts are protected should parallel content agents enrich QL, Episode 1, Episode 2, and supporting material.

**Advantage:** fixes causal structure and makes large-scale content work durable, reviewable, and testable.
**Cost:** requires a staged migration and prevents immediate bulk rewriting until ownership/schema gates land.

### Approach C — Replace the current data layer with an entirely new corpus/graph platform

Rebuild ingestion, layouts, reading documents, and graph operations around a new store or external system.

**Advantage:** clean theoretical reset.
**Failure:** unnecessary disruption to working editor, exporter, search, and local-first infrastructure; much larger migration risk.

**Decision proposed:** Approach B.

## 6. Target architecture

### 6.1 Separate workspace, constellation, graph node, and lens concepts

The legacy “project” concept currently mixes filesystem/workspace concerns with semantic composition. The target vocabulary is:

- **Workspace:** owns the local database, resource roots, publication settings, and corpus scope.
- **Constellation:** reusable semantic composition with stable identity, metadata, membership, and primary canvas.
- **Graph node:** theory substance that can appear in zero, one, or many constellations and can project onto the timeline if temporal.
- **Canvas:** presentation/layout surface belonging to a constellation.
- **Timeline:** workspace-level temporal lens, never owned by a constellation.
- **Portal/reference placement:** a card in one constellation that resolves a target constellation.

All remaining `project*` names must either be migrated to these concepts or isolated behind an explicit legacy-compatibility boundary. New code must not continue the mixed vocabulary.

### 6.2 First-class constellation storage

Required canonical records:

```text
Workspace
  id
  root/path/publish settings

Constellation
  id
  workspace_id
  graph_node_id
  slug/title/summary
  constellation_kind
  primary_canvas_id
  schema_version
  created_at/updated_at

ConstellationMembership
  constellation_id
  member_graph_node_id OR member_constellation_id
  membership_kind
  role
  order_index
  source_coordinates
  optional QL membership metadata

ConstellationReferencePlacement
  host_constellation_id
  target_constellation_id
  canvas/layout identity
```

`targetCanvasId` may remain in a derived presentation payload during migration, but it must not be the canonical identity.

Required rules:

- foreign-key/repository validation of every target;
- same target constellation referenceable from multiple hosts;
- reference-cycle detection and useful navigation history;
- deletion semantics that distinguish deleting a placement from deleting the target constellation;
- membership and reference relations exported to the static bundle.

### 6.3 Independent timeline read/persistence boundary

Introduce a dedicated transport/repository operation:

```text
loadTimelineView(workspaceId, filters?) -> TimelineView
```

It must:

- begin from all local temporal graph metadata, not from canvas layouts;
- use Neo4j as relational/query sync where available without making an empty canvas the source of timeline membership;
- validate parseable temporal anchors and preserve temporal precision;
- join a dedicated timeline layout record for lane, vertical offset, width, height, and optional timeline-specific style;
- return nodes even when they have never been placed on any constellation canvas;
- support fact/claim/source/myth lanes or filters without conflating them;
- let reading open directly by `graphNodeId` without inserting the node into the active canvas.

Horizontal time position remains derived from date. Only user-controlled presentation overrides are persisted.

### 6.4 Local-first graph substance

The app already claims local-first behaviour but stores complete temporal/provenance metadata only in Neo4j. Add an authoritative local graph-node metadata projection sufficient to render canvas, timeline, search, and reading while offline.

Neo4j remains the relationship/query/sync engine. The local projection must not become a second unversioned truth. It requires:

- a schema version and sync state;
- deterministic IDs;
- explicit field ownership;
- migration and reconciliation rules;
- observable sync failures rather than silent substitution.

### 6.5 Content ownership and revision contract

Every seeded/enriched node requires:

```text
summary
body
content_origin        # seed, corpus-compiled, user-authored, imported
content_revision
source_coordinates
body_source_coordinates
seed_schema_version
```

Required merge rule:

- seeds may create missing content;
- a seed rerun may update seed-owned content only through an explicit content migration/version;
- user-authored or editorially enriched body content is never overwritten by a normal idempotent seed;
- local `node_document` and Neo4j body reconciliation compares revision/ownership, not merely “is empty?”;
- a dry-run report lists every proposed create/update/preserve/conflict before a bulk migration.

### 6.6 Face/body content quality contract

Every substantive node must pass:

**Face**

- specific title;
- one pithy summary that communicates the node’s role without jargon padding;
- no generic “follow the links” language;
- no evidence-state ambiguity disguised as certainty.

**Reading body**

- concise orientation;
- historical or conceptual detail;
- why the node matters to the episode/theory;
- extracted evidence and source anchors;
- interpretive/archetypal reading in a visibly separate section;
- counterclaims, limits, or unresolved questions where applicable;
- temporal and geographic context where applicable;
- QL membership/form where applicable;
- wikilinks/backlinks to related nodes and constellations.

The body must be represented in the editor’s real BlockNote document format and verified through the actual reading modal.

## 7. Typed QL contract

QL form must not be inferred from one generic coordinate or tag.

### 7.1 Constellation-level fields

For a QL-shaped constellation:

```text
constellation_kind: ql
ql_form:
  complete_sixfold
  partial_positional_map
  quaternity
  position_wheel
  double_helix
  other_explicit
ql_unit_id
ql_arc: day | night | braided | not_applicable
ql_topology: torus | klein | lemniscatic | composite | unspecified
ql_schema_version
ql_source_coordinates
ql_completeness_status
```

Coordinates must remain typed and distinct:

- psychoid/raw: `#0`–`#5`;
- positions: `P0`–`P5`, `P0'`–`P5'`;
- lenses: `L0`–`L5`, `L0'`–`L5'`;
- squares: `Square A`, `Square B`, `Square C`.

### 7.2 Membership-level fields

```text
ql_position_index: 0..5
ql_position_coordinate
ql_member_role
ql_order_index
ql_complement_coordinate
ql_day_night_orientation
ql_membership_source_coordinates
```

Position is often contextual to membership and therefore belongs on the membership relation even when a useful denormalized field also exists on the member node.

### 7.3 Structural invariants

- `complete_sixfold` contains exactly one ordered member at each 0–5 position.
- traversal closes 5 → 0 and preserves declared Day/Night orientation.
- a four-member Conceptual Operations Quaternity is not called a completed sixfold QL unit.
- Double Helix is modeled as a topology joining explicit strands, not as a generic six-member list.
- parent units, position wheels, and reusable member nodes retain their distinct identities.
- QL metadata survives offline hydration, layout flush, export/import, search, and portal navigation.

## 8. Historical/evidence taxonomy

Replace the current category heuristic with explicit typed facets.

### 8.1 Recommended fields

```text
entity_kind:
  event | institution | person | place | source | work | myth | claim | interpretation

historicity:
  historical | mythic | literary | theoretical | mixed

evidence_status:
  documented
  well_evidenced_inference
  interpretive
  contested
  alleged
  unverified
  disproven

claim_kind:
  fact | inference | interpretation | allegation | hypothesis | symbolic_parallel

temporal_role:
  occurred_at
  active_during
  source_published_at
  claim_about_time
  myth_located_at
```

Controlled tags remain available for subject/topic facets, but they may not substitute for these typed fields.

Claims and sources must also be separate graph entities. `SOURCED_FROM` connects a claim/event/interpretation to an actual document, testimony, archive, dataset, or scholarly work and carries a locator. Evidence status should live at the assertion or relationship level where possible, rather than being treated only as a whole-node adjective.

### 8.2 Timeline classification rules

- category/lane derives from explicit typed metadata, never from presence of `archetypalResonance`;
- documented historical events remain historical-event cards;
- myths appear in “Myth in time” only with `historicity = mythic` and `temporal_role = myth_located_at`;
- a contested claim appears in a claim/provenance lane, not as an occurred event;
- a documented event and a contested causal interpretation become separate nodes/relations where necessary;
- symbolic/archetypal recurrence is represented through `INSTANTIATES`, `ECHOES`, or a typed interpretive relation, not by relabeling the event.

### 8.3 Historical review discipline

Bulk content agents must not rewrite confidence labels from tone alone. For every promoted claim they must record:

- source and exact anchor;
- what is directly extracted;
- what is inferred;
- what contradicts/qualifies it;
- which relation is historical causation versus interpretive mapping;
- reviewer disposition.

The Episode 2 timeline’s 80 rows must each receive an explicit disposition: promoted, merged with named target and rationale, deferred, rejected, or awaiting evidence. Silent omission is not acceptable.

## 9. Geography model

Geography should be visible as a tag/facet in the UI but stored as reusable structured place data.

### 9.1 Place node

```text
place_id
display_name
aliases
place_kind
modern_country
historical_polity
latitude/longitude when defensible
geographic_precision
source_coordinates
```

### 9.2 Geographic relations

At minimum:

- `OCCURRED_IN`
- `BASED_IN`
- `ROUTED_THROUGH`
- `GOVERNED_FROM`
- `CLAIM_LOCATED_IN`

If the implementation retains general `LOCATED_AT`, the relation must carry a role rather than flattening all of these meanings.

### 9.3 UI and query behaviour

- show place chips on timeline/card reader metadata;
- filter timeline by place, region, historical polity, and route where available;
- allow one event to relate to multiple places;
- distinguish historical place name from modern display name;
- require a place relation or explicit `unknown/not applicable` disposition for every temporal historical node.

## 10. Wikilink and graph-link integrity

### 10.1 Canonical resolver

Implement a parser/resolver for:

- `[[target]]`
- `[[target|alias]]`
- heading/block anchors where supported
- escaped aliases in tables
- canonical path, alias, and stable graph-node identity

Resolution states must be explicit:

- resolved uniquely;
- ambiguous;
- missing;
- external/unmanaged.

### 10.2 Graph projection

- Materialize resolved document links as a neutral `REFERENCES`/`WIKILINKS_TO` relation; do not pretend every link is `INFLUENCES` or `RESONATES_WITH`.
- Preserve manually curated semantic relations alongside generated reference links.
- Build backlinks from the same index.
- Export/import the link graph.
- Link health must cover both markdown sources and reader bodies.

### 10.3 Corpus health gates

- every source path exists;
- every heading anchor resolves;
- basename-only ambiguous links are migrated to canonical paths;
- duplicate project/Epi-Logos copies have declared precedence and version/hash;
- no broken-link regression is accepted;
- orphan status is reported, not silently ignored.

## 11. Canonical source precedence

Editorial status and evidentiary status are separate axes. The following controls what content agents may treat as current project canon.

1. **Primary creative/theoretical source**
   - `antichrist-vault/supporting-bits/Antichrist Book - Frank.md`
   - quote files act as passage maps and must preserve exact anchors.
2. **Current editorial canon**
   - Episode 1 README and Episode 1.0 v9;
   - Episode 1.1 script v1;
   - Episode 2 v4;
   - current `ep-1.1/ql-units/` directory.
3. **Current graph ledgers**
   - `episode-1-2-archetypal-resonance.md`;
   - `episode-2-research-timeline.md`.
   These are indexes/derivations, not sufficient deep-reading sources by themselves.
4. **Research synthesis**
   - Episode 2 Reports 1–9.
   These outrank rhetorical episode language for factual qualification but require reconstructed claim-level citations.
5. **Generative provenance**
   - chat logs, handovers, supporting-bits research.
   Material must be promoted through review before becoming a factual canonical node.
6. **Archive/legacy**
   - `spec-versions/**`, Episode 2 v2, and `legacy/v1.md`.
   Use only when current canon explicitly carries material forward or a reviewer promotes it.
7. **Framework canon, versioned separately**
   - the repo-local Epi-Logos snapshot versus the currently installed Epi-Logos sources.
   A deliberate freeze-or-migrate decision is required; duplicate copies must not create ambiguous wikilinks.

## 12. Corpus build and migration strategy

### Phase 0 — Freeze, inventory, and back up

- export the live SQLite/Neo4j data and static bundle;
- produce a corpus manifest with file hashes and canonical status;
- snapshot live node IDs, content revisions, evidence tags, source paths, and test pollution;
- remove leaked test data through a reviewed, namespace-bounded cleanup only after backup;
- prohibit bulk content changes before ownership/schema migration.

### Phase 1 — Contracts and real test harness

- lock Workspace/Constellation/Canvas/Timeline vocabulary;
- define schemas in TypeScript and Rust from one authoritative contract;
- add local graph metadata and timeline layout migrations;
- define content ownership/revision and controlled vocabularies;
- create a real integration harness that starts isolated Neo4j/SQLite and fails if dependencies are absent.

### Phase 2 — Emergency runtime repair

- restore global timeline loading and direct graph-node reading;
- make production corpus seeding/compilation an invoked, idempotent path;
- prevent offline fallback from corrupting QL/portal metadata;
- repair the single-surface card shell;
- verify current data appears before enrichment begins.

### Phase 3 — First-class constellation migration

- create real constellation records for all declared constellations;
- migrate portal sidecars to target constellation IDs;
- introduce typed membership/reference relations;
- preserve current layouts and portal navigation;
- add multi-reference/higher-order compositions.

### Phase 4 — Metadata/link/geography migration

- introduce evidence/historicity/claim/temporal-role fields;
- migrate `myth-in-time` and speculation/contested classifications with per-node review;
- add Place nodes and relations;
- build wikilink resolver/backlinks/health reports;
- fix all nonexistent QL paths and source anchors.

### Phase 5 — Source-derived content enrichment

- populate pithy summaries and distinct reading bodies;
- execute QL, Episode 1, Episode 2 factual, Episode 2 contested, and supporting-corpus workstreams against the locked schema;
- require review manifests and preserve extraction/inference distinctions;
- write both local authoritative documents and graph sync safely.

### Phase 6 — Full verification and cutover

- run schema/migration, integration, rendered UI, export/import, and corpus-health gates;
- compare pre/post counts and explicit Episode 2 row dispositions;
- verify seed reruns preserve authored bodies and layouts;
- update architecture/data-model/setup docs;
- only then remove compatibility paths and stale manual seed scripts.

## 13. Subagent execution threads

These are bounded work packages, not permission to execute before this scope is validated. Each thread must leave a source manifest, tests, and a review report. Shared contract files remain owned by the coordinating/root thread.

### Thread A — Domain contracts and migrations

**Owns:** shared schema, Rust/TypeScript parity, local graph projection, content revision/ownership, controlled vocabularies, migration scaffolding.
**Depends on:** none.
**Blocks:** B, C, E, F, G, H, I.
**Must prove:** old data migrates without body/layout loss; TypeScript and Rust serialize the same fields.

### Thread B — First-class timeline recovery

**Owns:** timeline repository/transport, global temporal query, timeline layout persistence, direct reader opening, lanes/filters.
**Depends on:** Thread A contract.
**Must prove:** a temporal node absent from every active canvas still renders, can be resized/coloured, opens its reading body, and survives reload.

### Thread C — First-class constellation architecture

**Owns:** constellation registry, membership/reference model, portal resolution, multi-parent references, navigation history, child layout preservation.
**Depends on:** Thread A contract.
**Must prove:** constellation B can be referenced from A and C; deleting one placement does not delete B; higher-order nesting preserves every canvas.

### Thread D — Single-surface canvas cards

**Owns:** React Flow host/render type separation, shared resize/handle frame, card geometry/styles, dot/pill/card modes, visual regression coverage.
**Depends on:** can begin after target card contract is approved; avoid storage changes owned by A/C.
**Must prove:** exactly one visible surface, transparent host wrapper, accurate hitbox at all zoom levels, and real resize/colour persistence.

### Thread E — QL structure and metadata

**Owns:** 15 QL source files, QL field population, complete/partial/topology classification, ordered memberships, QL reader bodies, QL invariants.
**Depends on:** A and C.
**Must prove:** complete units have 0–5 exactly once; partial/quaternal/topological structures are not mislabeled.

### Thread F — Wikilinks, backlinks, and provenance resolver

**Owns:** parser/resolver, canonical aliases/anchors, reference relation, health reports, source manifest integration.
**Depends on:** A.
**Must prove:** current 812-link corpus resolves deterministically after duplicate-source precedence is declared; ambiguous links cannot silently choose a target.

### Thread G — Episode 1 archetypal and editorial field

**Owns:** Episode 1.0/1.1 current scripts, Book/quote maps, resonance ledger, large Episode 1 chat/handover, Devil/Christ lineages, masks, animal mappings, conceptual operations.
**Depends on:** A, C, E, F.
**Must produce:** face/body pairs, explicit source anchors, and dispositions for omitted portrait nodes named in the current resonance ledger.

### Thread H — Episode 2 documented historical spine

**Owns:** all 80 ledger rows plus Reports 2–4, 8, and 9; factual events, institutions, people, and chronology.
**Depends on:** A, B, F, I.
**Must produce:** one disposition per timeline row, split/merge rationale, face/body pairs, temporal precision, and place relations.

### Thread I — Geography and historical place graph

**Owns:** Place schema data, alias normalization, historical polity/modern country mapping, geographic relations and filters.
**Depends on:** A; coordinates closely with H/J.
**Must prove:** all historical temporal nodes have resolved place coverage or explicit unknown/not-applicable status.

### Thread J — Episode 2 intelligence, occultation, abuse, and technology claims

**Owns:** Reports 1 and 5–7, claim/counterclaim/warrant maps, contested and do-not-seed material.
**Depends on:** A, B, F, I.
**Must produce:** separate fact, claim, interpretation, and counterclaim nodes/relations; no allegation flattened into an event.

### Thread K — Evidence/tag migration and historical review

**Owns:** live-database audit, explicit reclassification manifest, `myth-in-time` cleanup, claim lanes, controlled tag normalization.
**Depends on:** A, B; works as reviewer over H/J rather than silently bulk-editing their content.
**Must prove:** documented historical fixtures remain historical; real myths alone receive mythic temporal placement.

### Thread L — Production compiler, export, and verification

**Owns:** single invoked corpus compiler/seed path, dry-run/apply reports, idempotency, static export/import parity, cleanup of stale/manual seed paths, full acceptance run.
**Depends on:** all preceding runtime/schema/content threads.
**Must prove:** a clean workspace can build the same verified graph and UI from the canonical corpus without manual database intervention.

## 14. Parallel execution waves

With four total agent slots, use review-gated waves:

1. **Wave 1:** A as primary; D and corpus-manifest preparation may run read-only in parallel; root coordinates contract decisions.
2. **Wave 2:** B, C, and F in parallel after A is merged; root reviews cross-contract behaviour.
3. **Wave 3:** E, I, and K infrastructure/migration fixtures; root verifies QL/evidence/geography invariants.
4. **Wave 4:** G, H, and J content work in parallel against frozen schemas; each uses disjoint source/node ownership.
5. **Wave 5:** L integrates, migrates, exports, and runs the entire acceptance suite.

No two agents may concurrently edit the shared graph contracts, seed compiler core, or migration registry. Content agents write manifests/data inputs rather than bespoke repository code.

## 15. Real verification gates

The project instruction that tests verify real functionality is binding.

### 15.1 Test environment

- dedicated isolated Neo4j database/container per integration run;
- temporary real SQLite database;
- real filesystem fixture copied from representative canonical sources;
- deterministic namespace and cleanup in `finally`/fixture teardown;
- missing Neo4j makes required integration jobs fail, not pass/return early;
- no development database is used by tests.

Mocks remain acceptable only for pure mathematical/parser unit tests. They cannot satisfy acceptance for repository, transport, persistence, migration, or rendered workflows.

### 15.2 Timeline regression tests

- seed a temporal node with no canvas layout;
- open the root portal constellation;
- switch to timeline and observe the temporal node;
- verify a non-temporal portal is absent;
- double-click and read the correct deep body;
- resize/recolour the timeline card and reload;
- run offline from local graph projection;
- verify fact/claim/myth lanes using real persisted metadata.

### 15.3 Constellation tests

- create at least three real constellations from repository APIs;
- reference one target from two different hosts;
- navigate in/out while preserving layouts and breadcrumbs;
- prevent invalid/cyclic references where policy disallows them;
- preserve QL metadata through offline fallback and flush;
- export/import and repeat navigation.

### 15.4 Card tests

- browser-level computed geometry for host and visible surface;
- exactly one non-transparent/nonzero card surface;
- transparent/padding-free React Flow wrapper;
- accurate dot/pill/card hitbox at representative zooms;
- real pointer resize from every supported corner;
- colour and size preserved through persistence/reload;
- visual capture for the root portal field and one child constellation.

### 15.5 Content and seed tests

- source paths and anchors exist;
- every seeded substantive node has distinct summary and body;
- body meets real BlockNote schema;
- seed rerun preserves user/editorial body and local revision;
- production bootstrap invokes the compiler/seed path;
- clean build counts match the manifest;
- stale 49-node/manual seeds cannot silently become active;
- QL complete-unit invariants are checked from persisted graph data.

### 15.6 Link/tag/geography tests

- wikilink parser fixtures cover aliases, anchors, tables, ambiguity, and missing targets;
- all canonical corpus links resolve or have explicit unmanaged status;
- documented Event + archetypal relation remains `historical-event`;
- actual Myth + `myth_located_at` becomes `myth-in-time`;
- contested claim remains a claim/provenance lane;
- every temporal historical fixture has a persisted place relation;
- search, timeline filters, reader metadata, and static export agree.

### 15.7 Full gates

```text
pnpm typecheck
pnpm test
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -- --test-threads=1
real Neo4j + SQLite integration suite
Playwright rendered workflow suite
production build
corpus/link/metadata linter
static export/import verification
```

## 16. Definition of done

The programme is complete only when all statements below are true.

- Timeline displays all eligible temporal nodes independently of active constellation.
- Timeline is not represented as a constellation node, canvas, source kind, or portal target.
- At least the currently declared 18 structures exist as real first-class constellation records where appropriate, not merely child canvases.
- Higher-order constellations reference reusable child constellations by stable ID.
- Every QL-shaped constellation carries typed QL metadata, and every QL member carries contextual position/order metadata.
- Complete, partial, quaternal, wheel, and topological QL forms are not conflated.
- All substantive seeded nodes have pithy face copy and source-derived deep reader bodies.
- Normal reseeding cannot overwrite authored/enriched bodies.
- All 80 Episode 2 timeline rows have explicit disposition.
- Historical fact, interpretation, myth, allegation, and evidentiary confidence remain separate.
- “Myth in time” is reserved for actual mythic material with temporal location.
- Place nodes/relations support geographic chips and filtering alongside time.
- Wikilinks resolve through a canonical index and produce backlinks/reference relations.
- All QL source paths exist; ambiguous duplicate source copies have declared precedence.
- Root cards render as one clean surface with persistent colour and size.
- Live-data migration removes test pollution and preserves user data with auditable reports.
- Critical tests run against real databases and fail when their dependencies are unavailable.
- Architecture, data-model, setup, and corpus-governance documentation match the implemented system.

## 17. Explicitly deferred until scope validation

- No bulk rewrite of historical confidence labels.
- No automated enrichment of all 121 seed bodies.
- No destructive cleanup of live Neo4j test pollution.
- No migration of legacy SQLite tables or exported bundle formats.
- No removal of old seed scripts.
- No decision to update the project’s frozen Epi-Logos snapshot to the currently installed framework canon.

Those actions become safe only after the contract, backup, dry-run, and review gates above are approved.

## 18. Immediate next planning documents after approval

This scope should be followed by small, executable implementation plans rather than one monolithic plan:

1. Timeline emergency restoration and real integration harness.
2. Content ownership/local graph metadata contract and migration.
3. First-class constellation/reference architecture.
4. Single-surface card rendering remediation.
5. QL/evidence/geography/wikilink schemas and corpus compiler.
6. Content-enrichment plans for QL, Episode 1, Episode 2 factual, and Episode 2 contested work.
7. Full cutover, live-data cleanup, and acceptance verification.

Each plan must use test-first steps, exact file ownership, real database fixtures, review checkpoints, and small commits.
