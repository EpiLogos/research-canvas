# Wayfinder map draft — Research Canvas surfaces & generalisation

Drafted during the destination grilling session (2026-08-08). The canonical map is the GitHub issue labelled `wayfinder:map`; this file is the reviewed source. Created on GitHub on 2026-08-08 — issue numbers below are live.

**Run status (2026-08-08):** all tickets resolved in one wayfinder session. Full resolutions in
[2026-08-08-surfaces-map-resolutions.md](2026-08-08-surfaces-map-resolutions.md); research
findings in [2026-08-08-surfaces-research-findings.md](2026-08-08-surfaces-research-findings.md).
Locked decisions are folded into the vision spec §3.

## Issue numbers

- Map: [Research Canvas surfaces & generalisation map](https://github.com/EpiLogos/research-canvas/issues/1) (`#1`)
- #2 Data posture for map, street view, and globe — `wayfinder:grilling`
- #3 Build order and the first execution slice — `wayfinder:grilling` (blocked by #2, #4)
- #4 What the mind palace is — `wayfinder:grilling`
- #5 Historical geography research — `wayfinder:research`
- #6 Map, globe, and street-view stack research — `wayfinder:research`
- #7 Media pipeline research — `wayfinder:research`
- #8 Migration profile shape — `wayfinder:grilling`
- #9 Temporal Place contract — `wayfinder:grilling` (blocked by #2, #5)
- #10 Scene contract and sequence semantics — `wayfinder:grilling`
- #11 Published story experience — `wayfinder:grilling` (blocked by #8)

## Map body

```markdown
## Destination

The locked vision spec for Research Canvas as a general epistemic/historical instrument —
`docs/superpowers/specs/2026-08-08-research-canvas-surfaces-vision.md` — with every open
decision in §5 resolved, so a fresh session can plan and implement the first slice.

## Notes

Domain: Research Canvas — one product, many surfaces over one graph. Skills every session
should consult: grilling, domain-modeling, wayfinder, writing-plans, m-dev (execution).
Standing preferences: local-first and offline-capable; raw source artifacts are canonical and
agent-immutable; real tests, no mocks; lock decisions before implementation. Decisions from
the destination grilling live in the vision spec §3 — the map's Decisions-so-far below only
indexes ticket resolutions.

## Decisions so far

<!-- the index — one line per closed ticket: enough to judge relevance, then zoom the link for the detail the ticket holds -->

- #2 Data posture — offline-first core (bundled tiles, local gazetteer/geocoding, local 3D),
  live enrichment explicit opt-in per surface/action; nothing leaves the machine unless
  opted-in. → resolutions
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

## Not yet specified

- Agent review workflow UX (diffing agent-built structure, approvals).
- Consent lifecycle mechanics: capture, withdrawal, and publication gating beyond the
  passage-level redaction states locked in #8/#11.
- Constellation-profile authoring affordances beyond timeline/scene shaping.

## Out of scope

- In-app co-creation by migrants or other end users — auth/accounts and hosting are a future
  effort; the seam stays open. Closed: <linked ticket if one is created and closed>.
- Hosted multi-user platform.
- Rewriting the raw corpus; agents never own source artifacts.
- New locked substrate categories — categories stay locked; scenes and profiles live above.
```

## Tickets (creation order)

### 1. Data posture for map, street view, and globe

Label: `wayfinder:grilling` — **Question:** Is the psychogeographic surface offline-first with live services as explicit opt-in, or live-dependent? The recommendation is offline-first core (cached map data, local geocoding, local 3D where feasible) with live enrichment opt-in, on privacy, low-connectivity fieldwork, and the local-first ethos. HITL.

### 2. What the mind palace is

Label: `wayfinder:grilling` — **Question:** What is the mind palace concretely — a generated navigable space from graph structure with memory-palace conventions (recommended), authored rooms, or a guided recall mode? HITL.

### 3. Build order and the first execution slice

Label: `wayfinder:grilling` — Blocked by tickets 1 and 2. **Question:** What ships first — substrate geography + nested timelines, then the psychogeographic surface, then the migration profile, then the mind palace (recommended); or does the migration career goal lead? HITL.

### 4. Historical geography research

Label: `wayfinder:research` — **Question:** Which historical-geographic datasets and services (Pleiades, Pelagios, OldMapsOnline, gazetteers, geocoders) can ground temporal-place resolution, under what licenses and offline constraints? AFK — resolve via a research subagent.

### 5. Map, globe, and street-view stack research

Label: `wayfinder:research` — **Question:** Which offline-capable stack supports map, globe, and street-view surfaces (MapLibre/OSM, Cesium, Mapillary, 3D tiles, offline packaging), with licensing and privacy notes? AFK — resolve via a research subagent.

### 6. Media pipeline research

Label: `wayfinder:research` — **Question:** Which local-first stack supports transcription, timestamp-anchored passage provenance, media playback/sync, and storage for large raw artifacts? AFK — resolve via a research subagent.

### 7. Migration profile shape

Label: `wayfinder:grilling` — **Question:** What does the migration profile's timeline and constellation look like — journey as scene sequence (origin / transit / destination), multilingual presentation, consent and redaction artifacts, keepsake exports? Recommendation outline in vision spec §3.7–3.8. HITL.

### 8. Temporal Place contract

Label: `wayfinder:grilling` — Blocked by tickets 1 and 4. **Question:** Exactly what does a Temporal Place carry — precision levels, hierarchy depth, time-bounded identity fields, coordinate representation — and how do scenes reference place-plus-time? HITL.

### 9. Scene contract and sequence semantics

Label: `wayfinder:grilling` — **Question:** What does a Scene hold, how do scene sequences compose and nest, and what are the agent-assembly versus human-curation rules? HITL.

### 10. Published story experience

Label: `wayfinder:grilling` — Blocked by ticket 7. **Question:** What must a published story surface deliver — navigation, language switching, media playback, consent states, keepsake export — and what must the auth seam preserve for future opening up? HITL.
