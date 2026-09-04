# Constellation Ingestion — the seam for sources and agent chat

Refinement-2 D11 + D12, ticket #27. This is the skill spec for turning raw
sources and agent-chat output into QL-organised constellations
(`episode` / `document` / `conceptual`), and the contract of the deterministic
ingestion boundary (`constellation_ingestion.rs`) that keeps the raw corpus
canonical and agent-immutable.

**The design is general, not Antichrist-specific.** The Antichrist corpus is
bootstrapping content only. Any harness — Claude Code, Codex, ai-kit, or a
custom one — drives the same surface.

---

## 1. Two source families, one derivation boundary

| Family | Examples | Kind | Assembly |
|---|---|---|---|
| Raw source files | documents, transcripts, recordings, images | `document` / `episode` | `agent_parse` or `construct` |
| Agent work | chats and agent-produced structure in the terminal | `episode` / `conceptual` | `agent_parse` (chats) or `construct` |

Everything routes through one derivation boundary:

```
raw source file (read-only) ──► QL/MEF parse ──► derived constellation
                                                    │  assembly provenance
                                                    │  (rawSourceRefs, passage-level)
                                                    ▼
                                        SQLite constellation record
                                        + graph Constellation node
                                        + ENCAPSULATES edges to members
```

**The raw corpus is canonical and agent-immutable.** Derivation only *reads*
source files; it never writes back to them. Every derived artifact carries
passage-level provenance (`rawSourceRefs`) anchored to the actual bytes it was
read from (text spans with real `startOffset`/`endOffset` into the source file).

## 2. The derivation contract

An ingestion input is:

```text
profile_scope          — the profile the constellation belongs to
kind                   — episode | document | conceptual
title / slug           — QL-aligned titles are agent- or user-chosen, user-overridable
parent_constellation_id— the active project/constellation (projects ARE constellations)
source_path            — absolute path to the raw source file (READ-ONLY)
source_kind            — document | transcript | recording | image | chat
member_graph_node_ids  — the QL/MEF parse output: which graph objects are members
agent_session_id       — the durable tmux session id (harness-agnostic)
parse_kind             — "ql" | "mef" when the artifact was agent-parsed
```

The derivation computes `rawSourceRefs` (text_span passages) from the actual
file, builds the constellation's `metadata` (time / place / QL / fileRefs /
content), and returns the record plus the member ids. It performs **no writes** —
persistence is a separate, explicit step (`persist_constellation` to SQLite,
`persist_constellation_graph` to Neo4j).

### Passage-level provenance

`rawSourceRefs` entries are `{ artifactId, unit: { kind: "text_span", startOffset, endOffset } }`.
The offsets are **real byte offsets into the source file** — slicing the file at
`[startOffset, endOffset)` yields the exact passage. This is the same
raw-immutable + provenance pattern the corpus seeds and geography edges use:
derived artifacts point back to the raw corpus; they never restate it.

## 3. The agent-chat ingestion seam (harness-agnostic)

Agent harnesses plug in through the same seams as asset-fetching — the durable
per-workspace tmux session, skill packages, and lifecycle hooks. Nothing in the
seam is harness-specific.

### 3.1 The durable terminal session

The embedded terminal is a durable per-workspace tmux session
(`apps/desktop/src-tauri/src/pty/session.rs`):

```sh
tmux new-session -A -s research-canvas-{hash:016x} -c <workdir>
```

An agent inside the session obtains its `agentSessionId` with:

```sh
tmux display-message -p '#S'          # e.g. research-canvas-a7f3...
# or prefer the machine-readable export when the app sets it:
echo "$RESEARCH_CANVAS_SESSION_ID"
```

Chat output produced in the session is a raw source: it can be written to a
file and ingested with `source_kind = "chat"`. If the chat was parsed by an
agent into QL/MEF structure, the artifact's `assembly.source` is `agent_parse`
and `parseKind` is `ql` or `mef`; otherwise the assembly is `construct`.

### 3.2 Skill packages

A constellation-ingestion skill (authored in the repo agent-skill format, e.g.
`.claude/skills/constellation-ingestion.md`) teaches the agent to:

1. **Read** the raw source file(s) — never mutate them.
2. Parse into QL/MEF structure: decide the constellation `kind`, choose a
   QL-aligned title (user-overridable), and identify the **member graph node
   ids** that the parse produced.
3. Emit the ingestion input (above) and hand it to the app's ingestion
   boundary.
4. Confirm the derived constellation's provenance: `rawSourceRefs` must point
   at the raw passages; members must be the graph objects the parse resolved.

### 3.3 Lifecycle hooks

The seam is the same lifecycle the app uses for agent activity and asset
fetching: a run inside the tmux session produces an artifact (a chat file, a
doc, a structure), and the ingestion boundary derives a constellation from it.
Harnesses that do not use the app's tmux session can drive the exact same
surface by writing the ingestion input against the same boundary — the contract
is documented, not harness-specific.

## 4. Flexible shapes — never a rigid mod-6 schema

QL organising is **not** a rigid six-slot schema. Living partial structures at
any stage of unfolding are valid constellations:

- dyad, triad, quaternity, 4+2, nested — all valid `constellationShape` values;
- QL resonance tags stay optional;
- six positions are the complete frame, **not** a required slot count.

The constellation's `metadata.ql` holds the flexible shape object; the members
carry time, place, QL, file refs, deep details/content, other metadata, and
Neo4j edges. Curation events (`title`, `reorder`, `pin`, `exclude`,
`encapsulate`, `unfold`) mutate the constellation without forcing a schema.

## 5. ENCAPSULATES — the one deliberate substrate relation

A constellation can be **encapsulated as a single node** included in another
constellation: object compression at the data level. This is the one deliberate
substrate-relation addition to the locked relationship vocabulary.

- `ENCAPSULATES` is directed **container → member**.
- `mode` property, the two Spanda readings:
  - `outgoing` (0/1, bimba) — the container node unfolds into its
    constellation: ground → articulation.
  - `ingoing` (1/0, pratibimba) — the member constellation compresses into a
    single node included in a parent: articulation → ground.
- The node and its constellation are the same object at two scales (quotient
  identification). The latent 5 becomes explicit when the 4+2 nests.
- **Recursion allowed** (a constellation can contain a constellation); **cycles
  prohibited** (no transitive self-encapsulation). Adding `container → member`
  is rejected when `member` already transitively contains `container`.

### Round-trip

```
constellation ──ENCAPSULATES(mode=outgoing)──► member nodes
   ▲                                              │
   └──────────── unfold_constellation ────────────┘
        (members return with data intact)
```

Ingesting a constellation creates its graph node (graph_node_id = the
constellation/project id) and the ENCAPSULATES edges to each member; unfolding
returns the member nodes with bodies intact. This is tested against the real
graph store (`tests/encapsulation_roundtrip.rs`), not mocked.

## 6. Determinism and offline-first

- No new network dependency: derivation reads local files only.
- Idempotent seeding: `seed_key` per (profile_scope, seed_key) keeps re-runs
  from duplicating records.
- Raw corpus stays canonical; derived artifacts carry provenance, never
  restated content.
