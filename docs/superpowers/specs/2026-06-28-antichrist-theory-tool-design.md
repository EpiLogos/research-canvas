# Antichrist Series — Theory Tool: Design Spec

**Status:** Draft for review
**Date:** 2026-06-28
**Supersedes framing in:** the incoming "Build Specification" (intent doc) — this spec reconciles that intent against the real repo.

---

## 0. How to read this

This is the **design** — the shape and the decisions, at design altitude. It does **not** contain step-by-step implementation; that lives in the per-workstream plans produced afterward (via the writing-plans skill). There are **no time estimates** anywhere by intent. Build order is expressed as *dependency order*, not schedule.

The incoming Build Specification was "intent, not repo knowledge." Everything below was verified against the actual codebase first. Where the intent doc and the repo disagreed, the repo wins and the disagreement is called out.

---

## 1. What this is (purpose)

A **local-first** tool for developing the theoretical and historical narrative of the *Image of the Antichrist* video series, framed within the Christ / Antichrist / Man / God / Humanity archetypal field.

- **The theory lives in the graph.** The tool exists to construct, edit, and navigate that graph through two lenses: a **canvas** (trans-temporal, spatial — for building the archetypal/logical narrative) and a **timeline** (the temporally-located material, ordered through history).
- Built and maintained by a **single developer**. The **web build is a read/display layer** over the same data — not a working environment, not multi-user. Anyone who wants to develop it clones the repo and runs it.
- Research is conducted by a **terminal coding agent** (Claude Code / Codex) running on existing subscriptions, which reads and writes the graph directly via MCP.

---

## 2. Current state (verified) — extend, don't rebuild

The app is **substantially built** (the project's own `CLAUDE.md` is stale — it claims "not yet implemented"; it is). Verified facts:

| Area | Reality | Source |
|---|---|---|
| Shell | Tauri v2, React 19, Vite 7, TypeScript 5.9, pnpm monorepo | `apps/desktop`, root `package.json` |
| Canvas | XYFlow (`@xyflow/react` v12.8.5), Zustand vanilla store | `packages/canvas` |
| Node types today | Note (textarea), Resource (file ref), Group | `packages/canvas/src/nodes/` |
| Node "full view" | `FullScreenReader` exists but shows plain textarea / read-only markdown. **No rich-text editor anywhere** | `apps/desktop/src/layout/FullScreenReader.tsx` |
| Timeline | **Does not exist.** A "sequence" feature exists (narrative choose-your-path traversal), which is *not* a time axis | `packages/canvas/src/sequences/` |
| Persistence | Pure SQLite (`rusqlite`). **No Neo4j/Graphiti/bolt anywhere** | `apps/desktop/src-tauri` |
| Saving | 120 ms debounce → full DELETE+INSERT replace of the whole canvas → unload flush **swallows errors** (`catch { return false }`); no transaction safety | `CanvasWorkspaceContext.tsx`, `commands/projects.rs` |
| Agent→graph | **Already exists** but writes to SQLite: app ships a `research-canvas` MCP server → internal HTTP API on `:9876` → `CanvasGraphRepository` | `.claude/mcp-servers/research-canvas/`, `src-tauri/src/api/` |
| Web reuse seam | **Already exists**: `WorkspaceTransport` abstraction (Tauri IPC ⇄ browser-bridge HTTP on `:4789`) + static exporter + `public-viewer` app | `packages/desktop-api`, `packages/exporter`, `apps/public-viewer` |
| Terminal | `portable-pty` + xterm.js, right-panel tab, project-scoped cwd, dual transport | `src-tauri/src/pty/`, `features/terminal/` |

**Consequence:** the two scariest-sounding asks in the intent doc — "agent writes the graph via MCP" and "same view code serves desktop + web through a thin interface" — already have working scaffolding. The Neo4j pivot is mostly **re-pointing existing seams**, not inventing them. And there is little authored graph data in SQLite (the real content lives in `antichrist-vault/` markdown + `episodes/`), so there is **no painful data migration** — the model is cut over cleanly.

---

## 3. Target architecture

One substrate, two lenses, a thin data interface, an agent loop.

```
┌─────────────────────────────────────────────────────────────────┐
│  Neo4j (Docker, local)  +  Graphiti                              │
│  THEORY SUBSTANCE: nodes, relationships, bi-temporal validity,   │
│  episodic provenance.  Gemini Flash (LLM) + Gemini embeddings.   │
│  Seeded with a mirror of canonical psychoid/coordinate operators │
│  (QL #0–#5, MEF/L-lenses, core Archetypes) using bimba grammar.  │
└───────────────▲─────────────────────────────────▲───────────────┘
                │ Graphiti MCP (agent authors)     │ Rust repo layer (app reads/writes)
                │                                  │
┌───────────────┴──────────┐        ┌──────────────┴───────────────┐
│  Terminal agent          │        │  SQLite (kept, repurposed)   │
│  (Claude Code / Codex)   │        │  LAYOUT ONLY: position, size, │
│  + Graphiti MCP +        │        │  style, viewport, app-state.  │
│  app "place-on-canvas"   │        │  Each row → graph_node_id ref.│
│  MCP                     │        │  (Saving bug fixed here.)     │
└──────────────────────────┘        └──────────────▲───────────────┘
                                                    │
                              WorkspaceTransport (already abstracted)
                                                    │
┌───────────────────────────────────────────────────┴──────────────┐
│  Frontend (React/XYFlow)                                          │
│  Canvas lens (trans-temporal) │ Timeline lens (temporal) │        │
│  Node = both a point in a lens AND a full rich-text document      │
└───────────────────────────────▲──────────────────────────────────┘
                                 │ static export (exists) → public-viewer = WEB READ LAYER
```

### 3.1 Two stores, cleanly split

- **Neo4j + Graphiti = theory substance.** Node bodies (the writing), relationships, archetypal links, temporal validity, provenance. Graphiti gives bi-temporal modeling, episodic ingestion, dedup, and hybrid (semantic + keyword + graph) retrieval. LLM client → **`gemini-2.5-flash`** (Graphiti GeminiClient default, 64k output); embedder → **`gemini-embedding-001`** (GeminiEmbedder). Optional reranker → stable `gemini-2.5-flash-lite` (avoid `-preview-*` models; deprecated upstream). API key from env; a local-embedder fallback is kept conceptually available for a no-metered-API mode.
- **SQLite = presentation only.** Canvas node positions/sizes/styles, viewport, panel/app-state. Each layout row carries a `graph_node_id` pointing at the Neo4j node it lays out. Layout is *not* polluted into the knowledge graph. This is also where the **saving bug is fixed in isolation** (§5.1), decoupled from the graph migration.

**Rationale for two stores over one:** layout is volatile presentation; theory is durable substance. Mixing x/y into the knowledge graph corrupts queries and timeline projection. Splitting them lets the timeline/canvas read the *same* graph while each maintains its own layout independently.

### 3.2 The thin data interface (web reuse)

The `WorkspaceTransport` seam already separates view code from data source. We extend it, not replace it. Desktop routes through Tauri/native against live Neo4j; the web build swaps in a **read-only** source (static export by default — see §6). View components must reach data **only** through this interface — never call Tauri or a DB driver directly — so the web build can reuse them. (Tauri APIs only work inside the app window; this is the structural reason the seam exists.)

### 3.3 MCP topology (decided)

- **Graphiti's official MCP server** is the agent's **theory-write path** — the agent authors nodes/episodes/relationships directly into the graph, with provenance.
- The existing **`research-canvas` MCP** is **slimmed to a "place-on-canvas / layout" role**: given a graph node id, place it on the canvas/timeline, set/read layout. It stops being a theory store.
- This keeps authoring deliberate (the agent is the intelligence, on subscription) while preserving easy "surface this new node in the UI" tooling.

---

## 4. Data model / ontology

### 4.1 Principle: the archetypal is relational, not a property

The essence of the archetypal is **relationality as such**. Therefore the archetypal field is modeled by **relating** theory nodes to **real operator nodes**, not by stamping flat tags. Flat archetypal properties would over-densify and misrepresent the thing.

- **Operator nodes are seeded from the canonical Epi-Logos / bimba source**: the QL positions (Psychoids **#0–#5**), the MEF lenses (the **L** coordinate family — logical, scientific, etc.), and the core **Archetype** nodes. They are mirrored into the Antichrist graph (own Neo4j DB) using the **same coordinate grammar** the Epi-Logos system already uses.
- **Coordinate grammar reused** (so a future merge into bimba is reconciliation, not migration):
  - `coordinate` — the standalone Bimba ground reference (no family prefix).
  - `source_coordinates: string[]` — the multi-form link from a theory node back to canonical coordinate/operator nodes (e.g. `["#2", "L2", "C3"]`). Always an array.
- **`Archetype` is a first-class node type** (it was already in the original plan). Archetypal realities are built **via relations** to Archetype and psychoid/MEF operator nodes.
- **One allowed summary property — `archetypal_resonance`**: a plain-language digest that *expresses/aggregates* a node's relational reach at the archetypal level for quick reading. It is explicitly **not** the data store for archetypal structure — the relations are. Treat it as a generated/curated caption, regenerable from the relations.

### 4.2 Entity types (Graphiti custom entity types)

Grounded in the Episode 2 corpus. Each has a temporal character that governs whether/how it projects onto the timeline.

| Entity type | Temporal character | Examples (Ep. 2) |
|---|---|---|
| **Figure** | temporal (lifespan) | Cosimo de' Medici, Cecil Rhodes, Jung, Epstein, Aquino |
| **People / Civilization** | temporal (span) | Dutch Republic, British Empire, the Bandanese, Völkisch movement |
| **Event** | temporal (point/span) | Banda genocide (1621), Balfour Declaration (1917), MK-ULTRA (1953–73) |
| **Institution** | temporal (founded →) | VOC, Bank of England, Round Table, CIA, City of London Corporation |
| **Source / Text** | temporal + provenance | *Aion*, Rhodes's "Confession of Faith", EFTA/FD-1023 documents |
| **Place** | mostly atemporal | the studiolo, Banda Islands, Wewelsburg, the island |
| **Work / Symbol** | trans-temporal | the studiolo-as-image, the owl, the black sun, the Klein bottle |
| **Archetype** | **trans-temporal** | Christ, Antichrist, the six animal pairings, Son of Man / Man |
| **Dynamic / Concept** | **trans-temporal** | play/work inversion, monopoly mechanism, the I-Deal, mono-poly |
| **Psychoid operator** (seeded) | atemporal | QL positions #0–#5, MEF/L-lenses |

### 4.3 Relationship types

Carry the logical and historical structure; carry Graphiti temporal validity where relevant.

- **`instantiates` / `echoes`** — *archetypal recurrence, the spine.* One trans-temporal pattern instantiated at many datable points (studiolo → Rhodes's secret society → MK-ULTRA → the island). This relation is what threads canvas ↔ timeline (§5.5).
- `causes` — direct historical consequence.
- `influences` / `transmits` — ideological/textual transmission.
- `opposes` / `polarity` — Christ ↔ Antichrist and other dualities.
- `inherits` / `descends` — lineage, dynastic/institutional succession.
- `transforms-into` — metamorphosis (visible empire → invisible governance).
- `located-at` — Place.
- `sourced-from` — provenance to a Source/Text/episode (Graphiti episodic provenance).
- `resonates-with` — a theory node ↔ a psychoid/MEF/Archetype operator node (the archetypal-field link; complements `source_coordinates[]`).

### 4.4 Bi-temporal + provenance

Graphiti supplies it. Used **where it serves the theory**, not as ceremony: relationships and claims can carry validity intervals and ingestion time, and every agent-ingested fact traces to its source episode. The developer is **not** required to date everything; trans-temporal material legitimately has no validity interval.

### 4.5 Node body = the theory

Each node carries: **title**, **rich theoretical content** (the writing — this *is* the theory), embedded images, optional temporal data (where relevant), `source_coordinates[]` + archetypal relations, `archetypal_resonance` digest, and any number of **linked markdown files / sources / images** (linked resources, *not* the canonical theory — the body is canonical).

---

## 5. Capabilities (the seven workstreams)

Described at design altitude. Dependency order is given; each becomes one or more granular plans. Test-first per the repo's standing rules (real SQLite in temp dirs, real Neo4j/Graphiti against an ephemeral instance, real fixtures; Rust tests `--test-threads=1`).

### 5.1 Saving, fixed first *(no dependencies)*
The current weak point, fixed in isolation before anything else touches the data layer.
- Replace whole-canvas DELETE+INSERT with **incremental, transactional** layout persistence (per-node/edge upserts inside a transaction; rollback on failure).
- Persist layout changes (drag, resize, viewport) **reliably and automatically**, with a crash-safe flush that **surfaces errors instead of swallowing them**.
- This workstream targets the **SQLite layout store only** — it is the right shape regardless of the graph migration, and de-risks everything after it.

### 5.2 Neo4j + Graphiti data layer *(depends on: nothing; parallel-safe with 5.1)*
- Docker-composed local Neo4j; Graphiti configured with Gemini Flash + Gemini embeddings.
- Define Graphiti **custom entity types** (§4.2) and relationship types (§4.3).
- **Seed** the canonical psychoid/MEF/Archetype operator nodes (mirror from Epi-Logos source) using bimba coordinate grammar.
- Re-point the Rust repository layer: theory substance → Neo4j; layout → SQLite with `graph_node_id`. **Clean cutover** (decided): Neo4j is the source of truth for substance from the start.
- Update the internal HTTP API + `WorkspaceTransport` so the frontend reads graph nodes from Neo4j and layout from SQLite, joined by `graph_node_id`.

### 5.3 Node-as-document *(depends on: 5.2)*
- A node opens to a **full rich-text page**: editable body using **BlockNote** (Notion-style block editor — slash commands, drag-handles, native image blocks, drag-and-drop; MIT, React-first, ProseMirror-based), embedded images, and the list of linked markdown files / sources, openable in place. (TipTap is the documented fallback if lower-level control is ever needed.)
- Canonical body is stored as BlockNote/ProseMirror JSON in Neo4j, with **markdown export** for linked-resource interop and the static web layer.
- Editing writes back to the graph node (debounced, transactional, same robustness bar as 5.1).
- Compact canvas/timeline representation (title + optional image/thumbnail) ↔ full page is the central UX upgrade.

### 5.4 Frictionless content + linking *(depends on: 5.3)*
- Add text/images with minimal friction (paste, drag-and-drop).
- **First-class, low-friction** actions to: link a markdown file/source to a node; link nodes to one another (creating typed relationships from §4.3). Not buried in menus.

### 5.5 Timeline lens *(depends on: 5.2; richer with 5.3)* — greenfield
The headline feature. Designed from the theory, not from a database:
- A **multi-scale** time axis with **semantic zoom**: Piscean-epoch millennia → century arcs → eras → single events → sub-event moments. Rich at every level (nested density bands, not dots on a line).
- Projects **only temporally-located** nodes (Event, and the temporal spans of Figure/People/Institution/Source). Trans-temporal nodes (Archetype, Dynamic, psychoid operators) are **not forced onto the axis**.
- **Archetypal lighting (the cross-cutting thread):** selecting a trans-temporal node (e.g. *the monopoly mechanism*, *Dog/Wolf*) **lights up every datable instance it `instantiates`/`echoes`** across the timeline — the spectral recurrence view. Conversely, an event surfaces which archetypes/operators resonate in it, with dominant/secondary "frequency" (the corpus's holographic principle).
- A node on the timeline is the **same full document** as on the canvas; opening it is identical.
- **v1 bar:** "navigable core, then iterate" — genuinely inviting (smooth multi-scale pan/zoom, archetypal lighting, click-to-open) and shippable; lanes/clustering/animation are iteration targets, not v1 gates.

### 5.6 Terminal / agent UX *(depends on: 5.2; MCP from §3.3)*
- Keep the terminal passthrough; improve the UX of invoking the agent and surfacing results.
- Graphiti MCP wired so the agent researches and writes nodes/episodes directly.
- Make the loop **legible**: show what the agent added/changed (new nodes, new episodes, new relationships), and let the developer **review new nodes and place them** on canvas/timeline (via the slimmed `research-canvas` place-on-canvas MCP + UI).

### 5.7 Web read-layer + repo/docs *(depends on: 5.2–5.5)* — see §6, §7

---

## 6. Web read-layer

- The web build is a **read/display layer** over the graph — viewing/access, not editing the theory.
- **Default shape: static export** (reuses the existing exporter + `public-viewer`). The export serializes from Neo4j (substance) joined with SQLite (layout) into a self-contained dataset the web build reads with no backend. Both lenses (canvas read-only, timeline) render from it.
- **Alternative (developer's later option):** point the web build at a **hosted/read-only Neo4j** through the same `WorkspaceTransport` read interface. Kept open by the §3.2 seam; not required for v1.
- **Same view code serves both targets** — desktop (live, editable, local Neo4j) and web (read-only, exported/hosted) — by routing all data access through `WorkspaceTransport`.

---

## 7. Repo / distribution

- A **clean repo**: code + docs + context, so the developer (or a fork) can clone and run.
- **Docs to write:** setup (Docker + Neo4j + Graphiti, Gemini keys, terminal + MCP wiring), architecture (this spec distilled), and the **data model / ontology** (entity + relationship types, the coordinate grammar, the seeded operators).
- **Fix stale `CLAUDE.md`** ("not yet implemented" is wrong) as part of this workstream.
- Distribution is **"clone the repo and run it,"** not packaged installers.

---

## 8. Key design decisions (record)

1. **Neo4j + Graphiti for substance; SQLite for layout.** (Two stores, cleanly split.)
2. **Clean cutover** of the data model — no dual-run, because there's negligible authored graph data to migrate.
3. **`gemini-2.5-flash` (LLM) + `gemini-embedding-001` (embedder)** for Graphiti (key in env); stable `gemini-2.5-flash-lite` reranker if any; local-embedder fallback kept conceptually available.
3a. **BlockNote** as the node-document rich-text editor (Notion-style blocks; ProseMirror core); body stored as JSON in Neo4j + markdown export. TipTap is the fallback.
4. **Archetypal field via relations to seeded operator nodes**, reusing Epi-Logos coordinate grammar (`coordinate`, `source_coordinates[]`); one `archetypal_resonance` summary property, not a data store.
5. **Standalone Neo4j now, mergeable later** — same grammar makes a future bimba merge a reconciliation.
6. **Graphiti MCP authors theory; slimmed `research-canvas` MCP places on canvas.**
7. **Timeline is a projection, not the substrate** — trans-temporal material is never forced onto the axis; archetypal lighting is the cross-cutting thread.
8. **Saving fixed first, in the SQLite layout store, decoupled from the migration.**

## 9. Resolved decisions & deferrals (was: open questions)

- **OQ-1 (operator seeding mechanism) — DEFERRED.** How to mirror the canonical QL/MEF/Archetype operator nodes from the Epi-Logos source into the standalone Antichrist Neo4j (one-time export script vs. thin sync) is handled later. The data-layer plan defines the *target shape* of seeded operators and leaves a clean seam for the import; it does not block on the script.
- **OQ-2 (Gemini model IDs) — RESOLVED.** LLM `gemini-2.5-flash`; embedder `gemini-embedding-001`; optional reranker stable `gemini-2.5-flash-lite` (never `-preview-*`). Verified against Graphiti's Gemini client docs.
- **OQ-3 (rich-text engine) — RESOLVED → BlockNote.** Notion-style block editor delivers the frictionless content/linking UX natively; ProseMirror-based, MIT. TipTap documented as fallback.
- **OQ-4 (seed scope) — RESOLVED.** The core coordinates/positions *are* the archetypes: seed the canonical psychoid operators (#0–#5), the core coordinate-position nodes (C/L/T/M/S/P anchors), and the core Archetype set. Series-specific dynamics are authored. Exact extraction list rides with the deferred seeding script (OQ-1).

## 10. Non-goals / boundaries (v1)

- Not multi-user; not a hosted editing product; no auth/collaboration.
- No packaged installers.
- Web build does not edit the theory.
- Timeline v1 does not require lanes/clustering/animation.
- No reimplementation of Graphiti's pipeline in SQLite (decided against).

---

## Appendix A — Source grounding

- Repo verification: frontend/canvas, persistence/data layer, terminal/MCP/web — mapped against actual files (§2 table cites paths).
- Theory grounding: `antichrist-vault/episodes/2/.../Episode_0_2_The_Fire_of_the_Gods_v4.md` + 9 research reports + the Episodes 0.2/0.3 Seeding Report (entity kinds, temporal vs trans-temporal split, scales, relationship/archetypal structure).
- Operator grammar: `Epi-Logos C Experiments/repo-ontology.md` (coordinate families C/L/T/M/S/P, Psychoids #0–#5, `coordinate` + `source_coordinates[]` law) and the live bimba graph.
