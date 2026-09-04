# Research Canvas surfaces map — ticket resolutions

**Date:** 2026-08-08
**Run:** wayfinder, one session, all tickets in map order
**Map:** [Research Canvas surfaces & generalisation map](https://github.com/EpiLogos/research-canvas/issues/1)

Every ticket on the map is resolved below in map order. Each resolution is self-contained so it
can be posted verbatim as the closing comment on its ticket. Research tickets (#5, #6, #7) draw
on the detailed findings in `docs/wayfinder/2026-08-08-surfaces-research-findings.md`.

---

## #2 — Data posture for map, street view, and globe

**Question:** Is the psychogeographic surface offline-first with live services as explicit
opt-in, or live-dependent?

**Resolution: offline-first core, live services as explicit opt-in.**

- The psychogeographic surface renders fully offline by default: bundled basemap tiles, local
  geocoding against a bundled gazetteer index, and local 3D where feasible (terrain packaged
  with the app, or a terrain-less globe for v1).
- Live services are explicit opt-in at the surface level and per action, never silently
  required: live geocoding enrichment, live tile refresh, remote gazetteer lookups (WHG /
  Pleiades), and Mapillary browsing.
- No data leaves the machine unless the user opts in for that specific action; user data
  (graph, media, transcripts, walks) is never uploaded.
- A visible connection indicator accompanies any live call; every surface works with it
  switched off.

**Rationale:** privacy (interviews and fieldwork), low-connectivity fieldwork, and the standing
local-first ethos. Matches the ticket's recommended answer.

**First-slice consequence:** the map surface ships with an offline tile package and a local
gazetteer index as core; the live/connected path is optional.

---

## #4 — What the mind palace is

**Question:** Generated navigable space from graph structure, authored rooms, or guided recall
mode?

**Resolution: the mind palace is a generated navigable space from graph structure.**

- The palace is a surface rendered from the graph: related-node clusters become chambers,
  graph edges become paths, and the space is generated from structure — not hand-authored
  geometry.
- Memory-palace conventions apply: spatial anchors (each chamber anchored to a graph node or
  cluster), chunking (chambers stay small and coherent), and a palace walk = a curated sequence
  of chambers, reusing the scene-sequence machinery of the psychogeographic surface.
- Authoring is curation, not construction: pin, exclude, rename, reorder chambers.
- Profile-aware: the bootstrapping profile gets QL-shaped chambers; other profiles (e.g.
  migration) shape chambers from their own vocabulary; QL is never forced on non-bootstrapping
  profiles.
- Guided recall is a viewing/study mode over the generated palace, not a separate surface.

This graduates the fog item "mind-palace relationship to scenes and walks": palace walks are
scene sequences whose place frames are chamber anchors.

---

## #3 — Build order and the first execution slice

**Question:** What ships first?

**Resolution: the recommended order stands.**

1. **Spine** — substrate geography (Temporal Place contract) + nested sub-timelines.
2. **Places surface** as the first full surface (map / globe / street view over the
   spine).
3. **Migration profile** — journey as scene sequence.
4. **Mind palace** — reuses mature scene/walk machinery.

The migration career goal does not lead: its presentation surfaces depend on scenes, and scenes
depend on the spine. The first slice is the spine — Temporal Place and Scene contracts
implemented at the substrate/profile boundary, with the map surface as the first consumer.

Blockers #2 and #4 are resolved, so this ticket is unblocked.

---

## #5 — Historical geography research

**Question:** Which historical-geographic datasets and services can ground temporal-place
resolution, under what licenses and offline constraints?

**Resolution (research):** offline-first gazetteer tier, with live enrichment as explicit
opt-in. Full findings with sources in
`docs/wayfinder/2026-08-08-surfaces-research-findings.md` (§1).

**Bundled, offline:**

- **Pleiades** (ancient world): CC BY; versioned JSON/CSV/RDF dumps; 41,480 places (v4.1,
  2025-05-28); names, locations with accuracy metadata, time periods. Fully offline.
- **Wikidata**: CC0; coordinates, temporal qualifiers (inception/dissolution, start/end time),
  hierarchy (P131); dumps are offline-usable. The time-bounded identity backbone.
- **GeoNames**: CC BY 4.0; 11M+ place names and alternate names; downloadable dumps; modern
  baseline for geocoding.
- **OpenHistoricalMap**: ODbL database with per-object licensing (CC0 encouraged); extracts
  available; historical boundaries with start/end dates.
- **Natural Earth**: public domain; base-map scales.

**Live enrichment (explicit opt-in):**

- **World Historical Gazetteer API** (University of Pittsburgh): geocoding services, index of
  47M+ records (GeoNames + Wikidata + contributed datasets); account/ORCiD required for
  downloads; records keep their source licenses.
- **OldMapsOnline / Georeferencer API**: aggregated historical scans; metadata via API; raster
  bulk download restricted per-map — a research pointer, not a bulk source.
- **Pelagios Commons ecosystem** (Peripleo, Recogito): linked-data place lookups; partner
  licenses vary (CC0, CC BY, CC BY-SA, CC BY-NC-ND); no single dump — per-partner datasets only.
- **Remote Nominatim / Photon** for live modern geocoding.

**Geocoding:** local Photon (Apache-2.0 software, OSM data) or local Nominatim (ODbL) plus a
GeoNames index for offline; WHG API remote for enrichment.

**Licensing posture:** ODbL requires attribution and share-alike for derived databases we
distribute; CC BY requires attribution; CC0 is free. All are acceptable for the local-first
instrument provided attribution is carried in the bundle manifest.

---

## #6 — Map, globe, and street-view stack research

**Question:** Which offline-capable stack supports map, globe, and street-view surfaces, with
licensing and privacy notes?

**Resolution (research):** full findings with sources in
`docs/wayfinder/2026-08-08-surfaces-research-findings.md` (§2).

- **Map + globe:** MapLibre GL JS (BSD-3-Clause), including its globe projection for the globe
  surface. One rendering engine for both; fully offline with local tiles.
- **Offline packaging:** PMTiles (single-file archive, works from local paths) or MBTiles;
  built from OSM / OpenHistoricalMap extracts with Planetiler; served locally by Martin if a
  tile server is wanted.
- **Terrain / 3D:** SRTM / Copernicus DEM quantized-mesh terrain packaged locally, or a
  terrain-less globe for v1. CesiumJS (Apache-2.0) + 3D Tiles (OGC Community Standard) is the
  fallback if terrain/3D-tiles needs outgrow MapLibre. Cesium World Terrain and ion assets are
  commercial and NOT offline-usable without a license.
- **Street view:** locally captured / imported fieldwork imagery is the core (own media, full
  privacy control). Mapillary is an explicit live opt-in (images CC BY-SA 4.0, API token; no
  offline bulk). Google Street View is excluded (terms prohibit caching/offline use).
- **Privacy:** runtime requires no third-party tile hosts; ODbL attribution for OSM-derived
  tiles; Mapillary-derived content carries CC BY-SA attribution and share-alike; locally
  captured imagery keeps faces/plates redaction in our own pipeline.

---

## #7 — Media pipeline research

**Question:** Which local-first stack supports transcription, timestamp-anchored passage
provenance, media playback/sync, and storage for large raw artifacts?

**Resolution (research):** full findings with sources in
`docs/wayfinder/2026-08-08-surfaces-research-findings.md` (§3).

- **Normalization:** ffmpeg (probe, audio extraction, chunking) — local.
- **Transcription:** faster-whisper (MIT; CTranslate2; word-level timestamps via
  `word_timestamps=True`; Silero VAD; 99 languages including German and Arabic) as primary;
  whisper.cpp (MIT) for Apple Silicon / CPU-constrained machines. Whisper large-v3 /
  large-v3-turbo weights (MIT), downloaded once, then fully offline.
- **Alignment / diarization (optional stage):** WhisperX (BSD-2-Clause) wav2vec2 forced
  alignment for accurate word timestamps; pyannote for speakers.
- **Passage provenance:** segments/words become passage records with media timestamp ranges
  (the native unit for audio/video per vision §3.6); emit structured JSON and WebVTT for
  playback.
- **Playback / sync:** browser-native audio/video + WebVTT cues and `timeupdate` for
  highlighted-sync reading; large media served locally with range requests.
- **Storage:** raw artifacts stored content-addressed on the local filesystem (hash-named
  blobs, sidecar metadata, SQLite index); derived transcripts are separate objects — raw files
  are never modified.
- **Privacy:** all inference local; no audio/video leaves the machine.

---

## #8 — Migration profile shape

**Question:** What does the migration profile timeline and constellation look like — journey
as scene sequence (origin / transit / destination), multilingual presentation, consent and
redaction artifacts, keepsake exports?

**Resolution:** journey as scene sequence with multilingual, consent-aware presentation.

- The migration profile composes journeys as scene sequences across three segments —
  **origin / transit / destination** — with a route constellation over Temporal Places; each
  place along the route can host its own sub-timeline.
- A migration-profile Scene carries: place frame (Temporal Place + scene time), time window,
  people involved, media/voice passages, and **language variants** of the storyteller's voice
  passages. Original voice passages are canonical; translations are derived objects with
  passage-level provenance.
- **Multilingual presentation:** each scene stores one or more language variants; presentation
  surfaces offer a language picker; storage keeps the canonical original untouched.
- **Consent and redaction** are passage-level derived artifacts: consent states (captured /
  withdrawn, with scope) and redacted spans rendered as gaps. Publication renders only
  consented passages.
- **Keepsake export:** a self-contained static bundle (existing exporter / transport seam) —
  navigable journey, own-language, media playback, consent-filtered, offline.
- **Auth seam stays open:** no accounts in v1; everything profile-scoped is packaged for
  export; future opening serves the same bundle behind an account gate.

---

## #9 — Temporal Place contract

**Question:** Exactly what does a Temporal Place carry — precision levels, hierarchy depth,
time-bounded identity fields, coordinate representation — and how do scenes reference
place-plus-time?

**Resolution:** a Temporal Place carries:

- **id** — `graph_node_id` (UUIDv4).
- **names** — one or more per language, each with `valid_from` / `valid_to` (time-bounded
  identity).
- **coordinates** — WGS84 latitude/longitude with an explicit precision level:
  `exact | approximate | region (polygon/GeoJSON, no point) | unlocated`. Precision never
  exceeds the source's precision.
- **hierarchy** — parent chain (site → city → region → country → …) as time-bounded
  relations; v1 supports direct parent + ancestor chain; a place belongs to a hierarchy only
  during its valid interval.
- **time-bounded identity** — the identity itself has `valid_from` / `valid_to`; the same
  ground hosts multiple identities (1453 Constantinople vs 2026 İstanbul) without
  contradiction.
- **external references** — gazetteer ids (Pleiades, Wikidata QID, GeoNames, WHG pid,
  OpenHistoricalMap) for reconciliation.
- **provenance** — every field links to passage-level source refs (native unit: text span,
  timestamp range, or image region).

**Scene reference to place-plus-time:** `Scene.placeFrame = { placeId, validAt }` where
`validAt` is an instant or interval inside the scene's time window; resolution uses the
offline gazetteer tier, and the scene's time window selects the applicable identity/boundary.

---

## #10 — Scene contract and sequence semantics

**Question:** What does a Scene hold, how do scene sequences compose and nest, and what are
the agent-assembly versus human-curation rules?

**Resolution:** a Scene holds:

- **id** and **profile scope**.
- **placeFrame** — `TemporalPlaceRef { placeId, validAt }`.
- **time window** — start/end; instants allowed.
- **people** — graph refs with roles.
- **media/voice passages** — passage refs (artifact id + native unit: text span, timestamp
  range, image region).
- **language variants** — derived translations of voice passages.
- **optional title/narration** — derived.
- **provenance + curation state** — `assembledBy` (agent | human) and curation events
  (pin / exclude / reorder / edit-as-derived).

**Sequence semantics:**

- A scene sequence is an ordered list of scenes (walks, stories, journeys).
- Sequences compose: a scene may contain a nested sequence; sequences nest inside
  sub-timelines.
- Sequences are profile-level units — a pattern over substrate nodes and relationships, never
  a new locked category.

**Agent-assembly vs human-curation:**

- Agents assemble candidate scenes from graph structure and passages (membership derived,
  like sub-timeline membership).
- Humans curate: pin, reorder, split, merge, exclude, edit derived text.
- The raw corpus is never modified; agent edits re-derive only unpinned/excluded parts.

---

## #11 — Published story experience

**Question:** What must a published story surface deliver — navigation, language switching,
media playback, consent states, keepsake export — and what must the auth seam preserve for
future opening up?

**Resolution:** a published story surface delivers:

- **Navigation** — journey as scene sequence over map + timeline; scene list and progress;
  place frames clickable into the psychogeographic surface.
- **Language switching** — per-scene language picker; default is the storyteller's language;
  original passages canonical, translations derived.
- **Media playback with transcript sync** — browser-native audio/video + WebVTT cues;
  passage highlighting during playback.
- **Consent states** — only consented passages render; redacted passages show as gaps or are
  hidden per consent settings; publication is consent-filtered at export time.
- **Keepsake export** — self-contained offline static bundle via the existing exporter:
  media, transcripts, map tile subset, navigation — importable and viewable without a
  backend.

**Auth seam preservation:**

- Exports are static bundles with no hardcoded local paths, reading from a bundle manifest.
- Everything is profile-scoped and consent-filtered before packaging.
- Future opening: serve the same bundle behind an account gate. Capture/consent lifecycle
  mechanics remain in the fog, but the export contract already honors them.

---

## Map — Decisions so far (index, one line per closed ticket)

- #2 Data posture — offline-first core (bundled tiles, local gazetteer/geocoding, local 3D),
  live enrichment explicit opt-in per surface/action; nothing leaves the machine unless
  opted-in. [resolutions]
- #4 Mind palace — generated navigable space from graph structure; chambers = clusters,
  paths = edges; curation not construction; profile-aware; palace walks reuse scene sequences.
- #3 Build order — spine (Temporal Place + nested sub-timelines) → psychogeographic surface →
  migration profile → mind palace; first slice = spine contracts.
- #5 Historical geography — offline gazetteer tier: Pleiades (CC BY), Wikidata (CC0), GeoNames
  (CC BY 4.0), OpenHistoricalMap (ODbL), Natural Earth (PD); live enrichment via WHG API,
  OldMapsOnline, Pelagios, remote Nominatim/Photon; local Photon/Nominatim for geocoding.
- #6 Map/globe/street-view stack — MapLibre GL JS (BSD-3) incl. globe projection; offline
  PMTiles/MBTiles via Planetiler/Martin from OSM/OHM extracts; own captured imagery for street
  view + Mapillary live opt-in (CC BY-SA 4.0); no Google Street View; CesiumJS (Apache-2.0)
  fallback for 3D Tiles/terrain.
- #7 Media pipeline — ffmpeg → faster-whisper/whisper.cpp (MIT) word-level timestamps →
  passage records + WebVTT; content-addressed local storage; optional WhisperX
  alignment/diarization; all local.
- #8 Migration profile — journey as scene sequence (origin/transit/destination); per-scene
  language variants; consent/redaction as passage-level derived artifacts; keepsake = static
  offline bundle; auth seam open.
- #9 Temporal Place contract — precision levels exact/approximate/region/unlocated;
  time-bounded names, hierarchy, and identity; WGS84 + GeoJSON; external gazetteer refs;
  scenes reference place-plus-time via `placeFrame { placeId, validAt }`.
- #10 Scene contract — placeFrame, time window, people, media/voice passage refs, language
  variants, provenance/curation state; sequences order, compose and nest; agents assemble,
  humans curate, raw corpus immutable.
- #11 Published story — navigable journey, language switching, sync playback, consent-filtered
  rendering, keepsake export; static bundle + profile-scoped packaging preserves the auth
  seam.
