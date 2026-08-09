# Build execution map — Research Canvas surfaces

**Date:** 2026-08-08
**Status:** execution phase after the wayfinder run closed #2–#11; destination is the locked
vision spec `docs/superpowers/specs/2026-08-08-research-canvas-surfaces-vision.md`.

## Live issues (2026-08-09)

- Map: [Research Canvas — build execution map (all slices)](https://github.com/EpiLogos/research-canvas/issues/12) (`#12`, `wayfinder:map`)
- [Slice 1 — Spine: Temporal Place, Scene, nested sub-timelines](https://github.com/EpiLogos/research-canvas/issues/13) (`#13`, assigned, in progress)
- [Slice 2 — Psychogeographic surface](https://github.com/EpiLogos/research-canvas/issues/14) (`#14`, blocked by #13)
- [Slice 3 — Migration profile](https://github.com/EpiLogos/research-canvas/issues/15) (`#15`, blocked by #14)
- [Slice 4 — Mind palace](https://github.com/EpiLogos/research-canvas/issues/16) (`#16`, blocked by #15)

Dependencies are native GitHub issue dependencies (14→13, 15→14, 16→15).

**Build status (2026-08-09):** slice 1 closed (#13) — spine contracts, graph
wiring, scene storage, nestable timeline frames all verified. Slices 2–4 are
implemented at their core layers (#14 geography/walks/map, #15 consent/
multilingual/keepsake, #16 palace generation/curation) with remaining UI
integration tracked in each ticket; full frontend suite 644/645 and the Rust
graph integration suite green.

---

This is the canonical task list for the build. Each slice is one GitHub issue (labelled
`wayfinder:task`) with a checklist; the map issue (`wayfinder:map`) carries this body. Order
and dependencies come from build-order ticket #3:

1. **Spine** — Temporal Place + Scene contracts at the substrate/profile boundary, nested
   sub-timelines (first slice; everything else depends on it).
2. **Psychogeographic surface** — map / globe / street view over the spine.
3. **Migration profile** — journey as scene sequence, multilingual, consent-aware.
4. **Mind palace** — generated navigable space from graph structure.

## Issue plan

- Map: "Research Canvas — build execution map" (`wayfinder:map`, this body).
- Slice tickets below, each `Part of #<map>` + `wayfinder:task` + native dependency on its
  predecessor.

---

## Slice 1 — Spine: Temporal Place, Scene, nested sub-timelines

Labels: `wayfinder:task`. Blocked by: (none — first slice).

### Checklist

- [x] Temporal Place contract in `packages/schema` (coordinates + precision
  exact/approximate/region/unlocated; time-bounded names; time-bounded identity; hierarchy;
  external gazetteer refs; passage-level provenance) with real validation tests.
- [x] Scene contract in `packages/schema` (placeFrame `{ placeId, validAt }`, time window,
  people, passage refs, language variants, curation state, assembledBy) with real tests.
- [x] Scene sequence semantics (ordered, composable, nestable, profile-level) with real tests.
- [x] Sub-timeline framing contract (frame node, Earth zero-case, nesting, trans-temporal
  nodes hover above) with real tests.
- [ ] Graph substrate wiring (Rust): Place gains precision/hierarchy/time-bounded identity
  properties; `LOCATED_AT` relations time-bounded; Scene/sequence storage at the profile
  boundary; integration tests against the real graph store.
- [ ] Timeline lens: nestable frame system over the current global axis; layout migration.
- [ ] Vision §3.10 data posture honored in the spine (offline/local-first; no live calls).

### Acceptance

- `pnpm vitest run` green for schema; Rust `cargo test` green with real repositories (no
  mocks).
- Temporal Place and Scene round-trip through the graph store: create → read → update with
  provenance intact.

**Status 2026-08-08:** contract layer complete and verified (schema tests 46/46, full
frontend suite 594/594). Graph-store wiring and the timeline lens remain.

---

## Slice 2 — Psychogeographic surface

Labels: `wayfinder:task`. Blocked by: Slice 1.

### Checklist

- [ ] Offline tile package + local gazetteer index (Pleiades/Wikidata/GeoNames/Natural Earth
  subsets; bundle manifest with attribution).
- [ ] Local geocoding (GeoNames index / Photon) with explicit live-enrichment opt-in and
  visible connection indicator.
- [ ] MapLibre GL JS map + globe over the spine; scene-based walks reuse the scene-sequence
  machinery.
- [ ] Street view: own captured imagery core; Mapillary as explicit live opt-in; redaction
  pipeline for faces/plates.
- [ ] Real tests: rendering seam, gazetteer resolution, walk assembly, opt-in gating.

### Acceptance

- Map/globe render fully offline; every live path is gated and indicated.
- A walk (scene sequence over Temporal Places) renders and is exportable.

---

## Slice 3 — Migration profile

Labels: `wayfinder:task`. Blocked by: Slice 2.

### Checklist

- [ ] Journey = scene sequence across origin / transit / destination; route constellation
  over Temporal Places; per-place sub-timelines.
- [ ] Multilingual presentation: per-scene language variants, language picker, canonical
  originals untouched.
- [ ] Consent/redaction as passage-level derived artifacts; publication renders only
  consented passages.
- [ ] Keepsake export: self-contained static bundle (media, transcripts, map tile subset,
  navigation) with no hardcoded paths.
- [ ] Real tests: scene assembly, consent filtering, export integrity.

### Acceptance

- A keepsake bundle opens offline in the public viewer with language switching and
  consent-filtered content.

---

## Slice 4 — Mind palace

Labels: `wayfinder:task`. Blocked by: Slice 3.

### Checklist

- [ ] Generated navigable space: chambers = related-node clusters, paths = graph edges.
- [ ] Memory-palace conventions: spatial anchors, chunking; palace walks = curated scene
  sequences with chamber anchors.
- [ ] Curation surface: pin / exclude / rename / reorder chambers; raw graph untouched.
- [ ] Profile-aware shaping (bootstrapping vs migration vocabulary).
- [ ] Guided recall as a viewing mode over the generated palace.
- [ ] Real tests: clustering, walk assembly, curation semantics.

### Acceptance

- A palace is generated from a real graph, curated in-app, and walked as a scene sequence.

---

## Not yet specified (fog — not in this build)

- Agent review workflow UX (diffing agent-built structure, approvals).
- Consent lifecycle mechanics beyond passage-level redaction.
- Constellation-profile authoring affordances.

## Out of scope

- In-app co-creation by end users; hosted multi-user platform.
- Rewriting the raw corpus; agents never own source artifacts.
- New locked substrate categories.
