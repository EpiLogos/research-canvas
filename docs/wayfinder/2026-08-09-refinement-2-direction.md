# Refinement 2 direction — Places, Stories, Palace

**Date:** 2026-08-09
**Status:** direction capture from product review of the four-slice build. This file is the
starting brief for the next refinement session; it intentionally **does not** extend the
locked vision spec yet — the next session should grilling these decisions (research + design)
before folding the survivors back into `docs/superpowers/specs/2026-08-08-research-canvas-surfaces-vision.md`
and the wayfinder map (#12–#16).

## What the previous pass got wrong (owned, not defended)

1. **The mind palace was a clustering re-skin.** The locked vision said "generated navigable
   space from graph structure", and the implementation shipped related-node clusters as
   styled cards. That is constellations with different chrome — not a palace. A palace is a
   **real spatial place**: rooms and locations, architecture and scale, images on walls,
   objects stored in rooms, and genuine navigation through the space. The next pass must
   build that, not re-skin the cards.
2. **"Psychogeographic" is the underlying principle, not a surface name.** It reads as jargon
   and hides what the lens actually is. The surface is **Places**: dated events get
   geography, walks are assembled from real gathered assets, and the map/globe is the visual
   experience. Rename the lens. The trinity then has a meaningful difference: **Places,
   Stories, Palace**.
3. **"Migration" wording is wrong for the corpus.** Rudolf II's Prague court, the VOC in
   Amsterdam, the Cult of Reason in Paris, Rhodes's confession in Oxford — these are
   historical geography, not a migration narrative. Forcing "migration" onto them is
   over-fitting one persona onto content it doesn't describe. Wording must be agnostic: the
   spine is timelines and geography; the story surface is a journey over located events.
   (Internal profile-scope keys may stay stable for data compatibility; the visible language
   and the seeded narrative must not claim migration.)
4. **Street view was built backend-first but never demonstrated end-to-end with real
   gathered assets**, and there is no mechanism to gather imagery at all. The import UI
   exists; the pipeline needs real content and an agentic way to fetch it.
5. **The canvas/constellation UI was never designed through the full pipeline.** The shell is
   five tabs; the product is a pipeline: constellations link ideas and events → the timeline
   dates them → Places locates them → Stories develop them with imagery and map/street data
   → the palace stores the whole objects in rooms. The UI should make that sequence visible
   and drivable, not hide it behind tabs.

## The reframed product arc

The instrument moves research objects from abstract structure to lived geography to narrative
to spatial memory:

1. **Constellations** — ideas and events linked on the canvas (structure).
2. **Timeline** — those links gain dates (temporal order).
3. **Places** — dated events gain geography; a globe/map is the visual experience of moving
   place to place; walks are built from real assets gathered per place (imagery located on
   map/street data, redacted locally, then placed on the globe).
4. **Stories** — journeys across places with imagery, voice, consent, and language. Agnostic
   framing: a journey surface, not a migration surface.
5. **Palace** — the whole objects (events, places, images, story scenes) stored in a real 3D
   spatial memory: rooms, architecture, navigation, object placement, guided recall inside
   the space. Distinct from constellations by being embodied and spatial, not abstract.

## Decisions the next session must grilling (research + design before code)

### D1. Places is globe-first
A genuine visual experience: a 3D globe (terrain-less v1 per vision §3.10) as the Places
surface, with place-to-place travel and walk routes drawn over it. MapLibre GL (already in
the stack) vs CesiumJS vs a lighter globe — validate offline posture first. The flat map is a
detail view, not the surface.

### D2. Movement data as geography streams
Flight paths, shipping routes, overland routes as **geography edges with provenance** —
rendered as real lines over the globe (e.g., VOC shipping lanes Amsterdam→Banda, Rhodes's
journeys), not new locked substrate categories. This makes planetary migration and movement
directly visible and gives the timeline↔places↔stories pipeline a spine.

### D3. Walks are built from gathered assets
An **agentic fetch mechanism via the in-house terminal** (xterm ↔ PTY/tmux bridge): an agent
prompt that runs download/fetch commands in the terminal, validates the result (mime type,
size, source/license capture), imports it into the street-view store, runs local redaction,
and only then associates it with a place/walk. Simple to set up because the bridge already
exists; the spec must define the prompt, the validation gate, and the provenance record.

### D4. Stories are agnostic journeys
Remove migration framing from visible language and from the seeded narrative. Media and
map/street data are first-class scene content. Consent and language pipelines stay as built.

### D5. The palace is a real 3D space
Rooms generated from graph objects; objects (events, places, images, story scenes) placed in
rooms; navigation and guided recall inside the 3D scene (three.js-class engine). This
replaces the card-cluster implementation. The research question is what "architecture"
means for a memory palace over this graph — spatial metaphor mapping, not decoration.

### D6. The canvas becomes a pipeline, not a tab rack
Redesign the constellation UI so the sequence constellations → timeline → places → stories →
palace is visible and drivable: e.g., a pipeline rail, "send to timeline / locate / add to
story / place in palace" actions, and a flow view. Design the whole sequence as one
experience.

## Wayfinder tickets to build out next session

Research and design first, then execution, with real evidence gates at each step:

1. **Places surface (rename + globe)** — rename lens, globe renderer selection and validation,
   offline tile/terrain posture, place-to-place travel, walk rendering on the globe.
2. **Movement streams** — flight/shipping/overland route data model as provenance-backed
   geography edges; seed real lanes from the corpus (VOC, Rhodes, etc.); render on globe.
3. **Agentic asset gathering** — terminal/tmux fetch agent spec + validation gate + import
   into street-view store + redaction + place association; demo with real gathered imagery
   end to end.
4. **Stories reframe** — agnostic wording pass (UI, seeds, exports), media + map/street data
   as scene content; keep consent/language.
5. **Palace 3D** — engine research, room generation from graph objects, object placement,
   navigation, guided recall in 3D; evidence: a navigable palace with real objects, not
   cards.
6. **Canvas pipeline redesign** — surface flow design, actions, tests through the whole
   sequence.

## Constraints that hold

Offline-first with explicit live opt-ins (§3.10); raw corpus immutable (§3.6); no new locked
substrate categories (routes are edges with provenance, not categories); profiles shape
surfaces but never force QL vocabulary (§3.3); auth seam open (§3.16). Nothing here changes
those; everything here is surface, data-geography, and wording work.
