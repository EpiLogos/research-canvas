# Canonical Corpus Enrichment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development, epi-logos:epi-logos-argument-cartography, and epi-logos:epi-logos-voice to implement this plan task-by-task.

**Goal:** Give every substantive canonical node a pithy face and a source-derived deep reading body, with explicit provenance, evidence limits, QL context, time, place, and links.

**Architecture:** Content agents write disjoint compiler manifests, not runtime code. Each row carries source coordinates, extracted versus inferred status, content origin/revision, and reviewer disposition. Bodies compile to the actual BlockNote document schema.

**Tech Stack:** Canonical Markdown sources, versioned manifests, compiler from Plan 05, BlockNote schema, corpus health tests.

---

## Shared content acceptance contract

Every substantive node requires a specific title; one pithy face summary; orientation; historical/conceptual detail; episode/theory relevance; extracted evidence with anchors; clearly separated interpretation; limits/counterclaims; temporal/geographic context where applicable; QL form/membership where applicable; and working wikilinks/backlinks. Generic `body_for()` prose is forbidden.

## Task 1: Enrich the 15 QL source structures

**Owns:** current `ep-1.1/ql-units/` sources and their manifest rows only.

1. Create review fixtures for all QL constellations/members, including complete, partial, quaternal, wheel, and double-helix forms.
2. Draft face/body pairs from canonical passages using QL voice; distinguish the node's own content from contextual membership.
3. Include explicit P/P'/#/L/Square coordinates only where sourced.
4. Run QL invariants, link health, and rendered-reader tests.
5. Commit: `content: enrich canonical QL structures`.

## Task 2: Enrich Episode 1 archetypal/editorial field

**Owns:** current Episode 1 README, Episode 1.0 v9, Episode 1.1 v1, Book/quote maps, resonance ledger, Episode 1 chat/handover, Devil/Christ lineages, masks, animals, conceptual operations.

1. Produce a node disposition manifest, including omitted portrait nodes named by the ledger.
2. Separate direct Book/script material, editorial synthesis, and archetypal inference.
3. Draft distinct face/body pairs with exact source anchors and neutral wikilinks.
4. Review for conceptual drift and unsupported certainty.
5. Commit: `content: enrich episode one constellation field`.

## Task 3: Enrich Episode 2 documented historical spine

**Owns:** all 80 ledger rows plus Reports 2–4, 8, and 9.

1. Give every row an explicit keep/split/merge/reject disposition and rationale.
2. Create fact/event/person/institution nodes with temporal precision, evidence status, place relations, and source anchors.
3. Preserve archetypal interpretation as a separate section/relation, never as historical classification.
4. Run timeline, place-coverage, reader, and link gates.
5. Commit: `content: build episode two historical spine`.

## Task 4: Map Episode 2 contested intelligence, abuse, occultation, and technology claims

**Owns:** Reports 1 and 5–7 plus relevant current-episode passages.

1. Build claim/warrant/counterclaim/source maps before drafting nodes.
2. Separate established facts, reported allegations, disputed claims, project interpretations, and do-not-seed material.
3. Use claim/provenance lanes; never flatten an allegation into an Event.
4. Include limits and strongest counterpositions in each deep body.
5. Commit: `content: map episode two contested claims`.

## Task 5: Review historical tags, places, and evidence across all content

**Owns:** review/disposition manifests only; implementation rows return to their originating content task.

1. Inspect every temporal node and all uses of `myth-in-time`, speculation, disputed, verified, and resonance tags.
2. Reserve mythic temporal placement for actual Myth nodes linked through `MYTH_LOCATED_AT`.
3. Require historical place coverage or explicit unknown/not-applicable disposition.
4. Verify confidence language in face copy matches evidence fields.
5. Commit: `content: review historical evidence and place metadata`.

## Task 6: Compile and render the complete enriched corpus

1. Run compiler dry-run and inspect every conflict/preserve/update.
2. Apply to a disposable clean workspace and a migrated fixture workspace.
3. Sample every workstream in the actual double-click reading modal; validate all bodies structurally.
4. Assert all 121 current seed nodes have non-generic summaries and bodies or a documented non-substantive exemption.
5. Commit: `content: compile reviewed node readings`.

