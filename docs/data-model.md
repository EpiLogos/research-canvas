# Data model / ontology

The archetypal is **relational, not a property**: the archetypal field is modeled by relating theory nodes to real operator nodes, not by stamping flat tags.

## Node labels

Every theory node carries `:TheoryNode` plus exactly one entity-type label. Seeded operators carry `:Operator` + their type label (they are canonical references, not authored theory).

| Entity-type label | `:TheoryNode` | Temporal character | Lens |
|---|---|---|---|
| `Figure` | yes | temporal (lifespan) | timeline + canvas |
| `People` | yes | temporal (span) | timeline + canvas |
| `Event` | yes | temporal (point/span) | timeline + canvas |
| `Institution` | yes | temporal (founded→) | timeline + canvas |
| `Source` | yes | temporal + provenance | timeline + canvas |
| `Place` | yes | mostly atemporal | canvas (timeline if dated) |
| `Work` | yes | trans-temporal | canvas |
| `Archetype` | yes | trans-temporal | canvas (lighting source) |
| `Dynamic` | yes | trans-temporal | canvas (lighting source) |
| `PsychoidOperator` | no (`:Operator`) | atemporal (seeded) | canvas (lighting source) |

## Common properties (every `:TheoryNode`)

- `graph_node_id` (string, UUIDv4) — the PK for the SQLite layout join. App-minted, unique.
- `title`, `body` (BlockNote/ProseMirror doc JSON, stored as a string; empty doc is `"[]"`), `summary`.
- `archetypal_resonance` — the one allowed archetypal **summary** property: a regenerable plain-language caption that aggregates a node's relational reach. It is **not** the data store for archetypal structure — the relations are.
- `coordinate` (string | null) — standalone Bimba ground reference, no family prefix (e.g. `"#2"`).
- `source_coordinates` (string[]) — multi-form links to canonical operator/coordinate nodes, e.g. `["#2","L2","C3"]`. Always an array.
- `created_at`, `updated_at` (RFC3339).

## Temporal-validity properties

Present on temporally-located nodes; absent/null on trans-temporal nodes (that absence is the two-lens signal):

- `valid_from`, `valid_to` (ISO-8601 | null).
- `temporal_precision` (`"year"|"month"|"day"|"decade"|"century"|"millennium"`).
- `is_temporal` (boolean) — the discriminator the frontend keys on. `true` ⇒ project onto the timeline. Defaults true for Figure/People/Event/Institution/Source; false for Work/Archetype/Dynamic/Place/PsychoidOperator; authorable per-node.

## Relationship types (directed, SCREAMING_SNAKE)

- `INSTANTIATES` — **the spine.** A datable instance realizes a trans-temporal pattern. Powers archetypal lighting. Carries `dominance` (`"dominant"|"secondary"`).
- `ECHOES` — weaker recurrence than `INSTANTIATES`; treated by the same lighting query.
- `CAUSES` — direct historical consequence.
- `INFLUENCES` — ideological/textual transmission.
- `OPPOSES` — polarity (Christ ↔ Antichrist); read symmetrically.
- `INHERITS` — lineage / dynastic / institutional succession.
- `TRANSFORMS_INTO` — metamorphosis (visible empire → invisible governance).
- `LOCATED_AT` — placement on a `Place`.
- `SOURCED_FROM` — provenance to a `Source` (carries the Graphiti `episode_id`).
- `RESONATES_WITH` — archetypal-field link to an `Archetype`/`PsychoidOperator`; read symmetrically.

## Coordinate grammar (seeded operators)

Operator nodes are seeded from the canonical Epi-Logos / bimba source using the **same coordinate grammar** the Epi-Logos system uses, so a future merge into bimba is reconciliation, not migration:

- QL positions: Psychoids `#0`–`#5` (`PsychoidOperator`, `operator_kind: "psychoid"`, `position: "#0".."#5"`).
- MEF lenses: the `L` coordinate family (`operator_kind: "mef_lens"`).
- Core `Archetype` nodes.

Theory nodes link back to these via `source_coordinates[]` and the `RESONATES_WITH`/`INSTANTIATES`/`ECHOES` relationships.

## SQLite layout store

Layout rows (`node_layout`, `edge_layout`, `canvas_app_state`) are keyed by `graph_node_id` and `canvas_id`. They hold position, size, style, viewport, and app-state only. Substance never leaks into these tables; layout never leaks into the graph.
