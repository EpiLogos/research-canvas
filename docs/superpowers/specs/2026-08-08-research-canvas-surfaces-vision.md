# Research Canvas — Surfaces & Generalisation Vision

**Status:** Decisions locked 2026-08-08 via the wayfinder run — destination of the wayfinder
map drafted in `docs/wayfinder/2026-08-08-surfaces-map-draft.md`; all §5 frontier decisions are
resolved (see §3.10–3.16 and the research findings).
**Date:** 2026-08-08
**Supersedes framing in:** `2026-06-28-antichrist-theory-tool-design.md` — this spec generalises that tool; the Antichrist series becomes its bootstrapping profile.

## 0. How to read this

Design altitude. Decisions locked during the destination grilling session are stated as decisions in §3. Genuinely open decisions are §5 and are the wayfinder map's frontier tickets. No step-by-step implementation here — that follows once the frontier resolves, in fresh sessions.

## 1. What this is (purpose)

Research Canvas remains a private, local-first instrument — but its purpose generalises from "the Image of the Antichrist series" to **epistemic and historical ideation and agentic knowledge work**. It builds research maps, timelines, documents, and theory graphs, with geography and the human voice becoming first-class citizens.

One product, many surfaces over one graph. The Antichrist work is not displaced — it is the bootstrapping profile, the one in which the QL field is derived and explained.

## 2. Verified current state

Checked against the codebase and docs, not assumed:

- **Two lenses** exist: the trans-temporal canvas and a workspace-global timeline. The timeline is a single axis with filters — never relative to a node.
- **Places are named nodes with a coverage flag** (`resolved` / `unknown` / `not_applicable`). No coordinates, no hierarchy, no temporal identity. `LOCATED_AT` relates things to places.
- **The public "MapView" is not a map** — it is the static-export landing page listing node cards.
- **Local-first and offline-capable**: no accounts, no hosted backend, no cloud sync. Desktop authoring (Tauri) + a read-only static web viewer.
- **An agent loop already exists**: the terminal coding agent reads/writes the graph via MCP; the vault's raw markdown files (scripts, chat logs, full-quote files, QL units) are the seed the graph is built from, indexed by a knowledge manifest.
- **Sequences exist**: hand-curated traversals over the canvas with saved viewport state — the seed of scene sequences.
- **Transport seam exists**: `WorkspaceTransport` abstracts desktop IPC from the static web build; the exporter produces self-contained bundles.

## 3. The shape — locked decisions

These were resolved in the destination grilling session and are canonical until a ticket reopens them.

### 3.1 One substrate, many surfaces

The graph is the single source of truth. The canvas, timeline, psychogeographic surface, story surface, and mind palace are surfaces — ways of seeing the same graph, not separate stores or products.

### 3.2 Substrate: locked categories, open resonance

The substrate keeps its locked categories (entity and relationship types, temporal validity, provenance) and gains open QL/archetypal tagging that is **never required and never first-class in visible surfaces**. The foundational ontology is open at the level of resonance and locked at the level of categorisation.

### 3.3 Profiles

Profiles shape how timelines and constellations are composed and read, at the layer above the substrate. The Antichrist/Epi-Logos profile is the bootstrapping profile — the one where QL is derived and explained. A migration profile is the second, shaping journeys as scene sequences without forcing migrant stories through archetypal vocabulary.

### 3.4 Temporal Places

A Place is a temporal, layered thing, not a pin:

- **Coordinates with explicit precision** — exact point, approximate, or region; never more precision than the source gives.
- **A place hierarchy** — site → city → region → country, so a river crossing, a detention centre, and a city relate cleanly.
- **Time-bounded identity** — name and boundary valid from–to, so the same ground carries its 1453 identity and its 2026 identity without contradiction.

### 3.5 Nested sub-timelines

There is no single timeline. Any node can be the frame of a sub-timeline, and timelines nest within one another:

- A Place's sub-timeline is the history of that place; a figure's is their life; an event's is its causes and consequences.
- The main timeline's spatial **zero-case is Earth**; zooming into any place descends into its own timeline.
- Trans-temporal nodes (Archetypes, Dynamics, pure Works) hover **above** the nesting — they light timelines from above rather than occupying a layer.
- Membership is agent-derived from the graph (related nodes within the frame's temporal window and spatial bounds) with human curation (pin/exclude) as an explicit layer.

### 3.6 The agent pipeline and the immutable raw corpus

- **Source artifacts** are heterogeneous and any-media: transcripts, chat logs, written stories, recordings, video, photos, maps, documents.
- The raw corpus is **canonical and agent-immutable** — agents never write into a source artifact. Everything agents produce (nodes, relationships, timelines, constellations, transcripts, summaries, translations) is a separate object carrying **passage-level provenance** at the artifact's native unit: text span, timestamp range, or image region.
- The join between source artifacts and graph objects is **many-to-many**: one chat log seeds dozens of nodes; one figure draws from many files. There is no file-per-node isomorphism.
- Agents build and maintain structure; humans review and edit in-app, easily.
- Test of the design: delete the graph, rebuild it from the corpus plus the curation layer, and lose nothing of the human voice.

### 3.7 Scenes as the shared unit

A **scene** is a profile-level unit joining a place frame, a time window, the people involved, and the media/voice passages anchored there. Both psychogeographic walks and migration stories are sequences of scenes. Scenes live at the profile level, not the substrate — a pattern over existing nodes and relationships. Agents assemble scenes from passages; humans curate.

### 3.8 The migration persona

The canvas is the **facilitator instrument** — the professional's authoring tool. Migrants and audiences meet the work through **presentation surfaces**: published, navigable experiences in the storyteller's own language, exportable as a keepsake. In-app co-creation is future work, so the auth/account seam stays open; profiles are the vehicle for opening up later.

### 3.9 The surfaces

| Surface | Status |
|---|---|
| Canvas (trans-temporal) | exists — stays the authoring surface |
| Timeline | exists — becomes nested sub-timelines |
| Places (map / street view / globe) | new — scene-based walks, globe exploration of historical periods |
| Story (migration) | new — journey as scene sequence, human voice front and centre |
| Mind palace | new — definition open, §5 |

### 3.10 Data posture (locked by #2)

Offline-first core; live services are explicit opt-in:

- The Places surface renders fully offline by default: bundled basemap tiles, local
  geocoding against a bundled gazetteer index, and local 3D where feasible (terrain packaged
  with the app, or a terrain-less globe for v1).
- Live services are explicit opt-in at the surface level and per action, never silently
  required: live geocoding enrichment, live tile refresh, remote gazetteer lookups, and
  Mapillary browsing.
- No data leaves the machine unless the user opts in for that specific action; user data
  (graph, media, transcripts, walks) is never uploaded.
- A visible connection indicator accompanies any live call; every surface works with it
  switched off.

### 3.11 Build order and the first execution slice (locked by #3)

1. Spine — substrate geography (Temporal Place contract) + nested sub-timelines.
2. Places surface as the first full surface (map / globe / street view over the
   spine).
3. Migration profile — journey as scene sequence.
4. Mind palace — reuses mature scene/walk machinery.

The migration career goal does not lead: its presentation surfaces depend on scenes, and
scenes depend on the spine. The first slice is the spine — Temporal Place and Scene contracts
implemented at the substrate/profile boundary, with the map surface as the first consumer.

### 3.12 Mind palace (locked by #4)

The mind palace is a **generated navigable space from graph structure**:

- Chambers = related-node clusters; paths = graph edges; generated, never hand-authored
  geometry.
- Memory-palace conventions: spatial anchors (chamber anchored to a graph node/cluster),
  chunking (small coherent chambers), palace walk = curated sequence of chambers reusing the
  scene-sequence machinery of the psychogeographic surface.
- Authoring is curation: pin, exclude, rename, reorder chambers.
- Profile-aware: bootstrapping profile gets QL-shaped chambers; other profiles shape chambers
  from their own vocabulary; QL is never forced on non-bootstrapping profiles.
- Guided recall is a viewing/study mode over the generated palace, not a separate surface.

Palace walks are scene sequences whose place frames are chamber anchors.

### 3.13 Migration profile shape (locked by #8)

- Journey = scene sequence across origin / transit / destination, with a route constellation
  over Temporal Places; each place along the route can host its own sub-timeline.
- Scenes carry place frame, time window, people, media/voice passages, and language variants
  of the storyteller's voice passages. Originals are canonical; translations are derived
  objects with passage-level provenance.
- Multilingual presentation: per-scene language variants; language picker on presentation
  surfaces; canonical original never overwritten.
- Consent and redaction are passage-level derived artifacts: consent states (captured /
  withdrawn, with scope) and redacted spans rendered as gaps; publication renders only
  consented passages.
- Keepsake export: self-contained static bundle via the existing exporter — navigable
  journey, own-language, media playback, consent-filtered, offline.
- Auth seam stays open: no accounts in v1; everything profile-scoped is packaged for export;
  future opening serves the same bundle behind an account gate.

### 3.14 Temporal Place contract (locked by #9)

A Temporal Place carries:

- **id** — `graph_node_id` (UUIDv4).
- **names** — one or more per language, each with `valid_from` / `valid_to`.
- **coordinates** — WGS84 lat/lon with an explicit precision level:
  `exact | approximate | region (polygon/GeoJSON, no point) | unlocated`; precision never
  exceeds the source's precision.
- **hierarchy** — parent chain (site → city → region → country → …) as time-bounded
  relations; v1 supports direct parent + ancestor chain.
- **time-bounded identity** — the identity itself has `valid_from` / `valid_to`; the same
  ground hosts multiple identities (1453 Constantinople vs 2026 İstanbul) without
  contradiction.
- **external references** — gazetteer ids (Pleiades, Wikidata QID, GeoNames, WHG pid,
  OpenHistoricalMap) for reconciliation.
- **provenance** — every field links to passage-level source refs.

Scenes reference place-plus-time via `Scene.placeFrame = { placeId, validAt }`, where
`validAt` is an instant or interval inside the scene's time window.

### 3.15 Scene contract and sequence semantics (locked by #10)

A Scene holds: id and profile scope; `placeFrame`; time window (instants allowed); people
(graph refs with roles); media/voice passages (artifact id + native unit); language variants
(derived translations); optional title/narration (derived); provenance and curation state
(`assembledBy` agent | human; pin / exclude / reorder / edit-as-derived events).

Sequence semantics: a scene sequence is an ordered list of scenes (walks, stories, journeys);
sequences compose (a scene may contain a nested sequence) and nest inside sub-timelines;
sequences are profile-level units — a pattern over substrate nodes and relationships, never a
new locked category.

Agent-assembly vs human-curation: agents assemble candidate scenes from graph structure and
passages (membership derived, like sub-timeline membership); humans curate — pin, reorder,
split, merge, exclude, edit derived text; the raw corpus is never modified; agent edits
re-derive only unpinned/excluded parts.

### 3.16 Published story experience (locked by #11)

A published story surface delivers:

- Navigation — journey as scene sequence over map + timeline; place frames clickable into the
  psychogeographic surface.
- Language switching — per-scene picker; default is the storyteller's language.
- Media playback with transcript sync — browser-native audio/video + WebVTT cues; passage
  highlighting.
- Consent states — only consented passages render; redacted passages show as gaps or are
  hidden; publication is consent-filtered at export time.
- Keepsake export — self-contained offline static bundle (media, transcripts, map tile
  subset, navigation) via the existing exporter.

Auth seam preservation: exports are static bundles with no hardcoded local paths, reading
from a bundle manifest; everything is profile-scoped and consent-filtered before packaging;
future opening serves the same bundle behind an account gate.

## 4. Consequences for the existing architecture

The existing two-store split (graph substance vs layout), `WorkspaceTransport`, the exporter, and the sequences feature all survive. What changes:

- Schema: Place gains precision, hierarchy, and time-bounded identity; provenance becomes passage-level; scene structures appear at profile level.
- Timeline lens: global axis becomes a nestable frame system with Earth as the spatial zero-case.
- Raw corpus: any-media ingestion with derived artifacts (transcripts, structure) and immutable originals.
- Export: presentation surfaces as first-class outputs (story keepsakes, walks), not just static node pages.
- Review UX: agent-built structure is reviewable and editable in-app without touching raw artifacts.

## 5. Frontier — resolved (closed 2026-08-08)

Every open decision was resolved in one wayfinder session; locked decisions live in §3.10–3.16,
research findings in `docs/wayfinder/2026-08-08-surfaces-research-findings.md`.

1. **Data posture for map, street view, and globe** — offline-first core with live services as explicit opt-in (recommended), or live-dependent. Privacy, low-connectivity fieldwork, and the local-first ethos decide it.
   **Resolved:** offline-first core, live opt-in per surface/action — §3.10.
2. **What the mind palace is** — generated navigable space from graph structure with memory-palace conventions (recommended), authored rooms, or guided recall mode.
   **Resolved:** generated navigable space from graph structure — §3.12.
3. **Build order and the first execution slice** — substrate geography + nested timelines first, then the psychogeographic surface, then the migration profile, then the mind palace (recommended); swapped if the migration career goal needs to lead.
   **Resolved:** recommended order stands; first slice = spine contracts — §3.11.
4. **Historical geography research** (AFK) — which historical gazetteers/datasets ground temporal-place resolution.
   **Resolved:** offline gazetteer tier (Pleiades, Wikidata, GeoNames, OpenHistoricalMap, Natural Earth) + live enrichment — research findings §1.
5. **Map/globe/street-view stack research** (AFK) — which offline-capable rendering stack and data sources.
   **Resolved:** MapLibre GL JS + PMTiles/MBTiles via Planetiler/Martin; own imagery + Mapillary opt-in for street view; CesiumJS fallback — research findings §2.
6. **Media pipeline research** (AFK) — local transcription, timestamp anchoring, playback, storage.
   **Resolved:** ffmpeg → faster-whisper/whisper.cpp word-level timestamps → passage records + WebVTT; content-addressed storage — research findings §3.
7. **Migration profile shape** — journey as scene sequence, multilingual presentation, consent/redaction artifacts, keepsake exports.
   **Resolved:** journey as scene sequence with per-scene language variants and passage-level consent/redaction — §3.13.
8. **Temporal Place contract** — precision levels, hierarchy depth, time-bounded identity fields, coordinate representation.
   **Resolved:** contract locked — §3.14.
9. **Scene contract and sequence semantics** — what a scene holds, how sequences compose and nest, agent-assembly vs curation rules.
   **Resolved:** contract locked — §3.15.
10. **Published story experience** — navigation, language switching, media playback, consent states, keepsake export; what the auth seam must preserve.
    **Resolved:** experience locked — §3.16.

## 6. Not yet specified (fog)

- The agent review workflow's concrete UX (diffing agent-built structure, approvals).
- Consent lifecycle mechanics: capture, withdrawal, and publication gating beyond the
  passage-level redaction states locked in §3.13/§3.16.
- Whether constellation profiles need their own authoring affordances beyond timeline/scene shaping.

## 7. Out of scope (this effort)

- In-app co-creation by migrants or other end users (auth/accounts, hosting).
- A hosted, multi-user platform.
- Replacing or rewriting the raw corpus; agents never own source artifacts.
- New locked categories in the substrate — categories stay locked; scenes and profiles live above it.
