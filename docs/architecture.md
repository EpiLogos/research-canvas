# Architecture

A local-first tool for developing the theoretical and historical narrative of the *Image of the Antichrist* video series. The theory lives in a graph; the tool constructs, edits, and navigates that graph through two lenses (canvas + timeline). The web build is a read/display layer over the same data.

## One substrate, two stores

- **Neo4j + Graphiti = theory substance.** Node bodies (the writing), relationships, archetypal links, temporal validity, provenance. Graphiti gives bi-temporal modeling, episodic ingestion, dedup, and hybrid retrieval, driven by Gemini (`gemini-2.5-flash` LLM, `gemini-embedding-001` embedder).
- **SQLite = presentation only.** Canvas node positions/sizes/styles, viewport, panel/app-state. Each layout row carries a `graph_node_id` pointing at the Neo4j node it lays out. Layout is never written into the knowledge graph.

The two stores are joined **only** by `graph_node_id` (an app-minted UUIDv4 that is the Neo4j node's stable id and the SQLite layout row's key). The join is performed in the Rust repository layer and re-exposed to the frontend already joined — the app never joins across the database boundary in SQL.

## Process topology

- **Tauri desktop app (Rust)** talks bolt directly to local Neo4j via the `neo4rs` crate for substance CRUD, reads layout from SQLite, performs the join, and serves the frontend through typed Tauri IPC commands.
- **Terminal agent (Claude Code / Codex)** authors theory through the **Graphiti MCP server** (entity extraction, dedup, provenance, embeddings) and places nodes on the canvas/timeline through the slimmed **research-canvas MCP**.

## The transport seam (web reuse)

All frontend data access goes through the `WorkspaceTransport` interface (`packages/desktop-api`). View components never call Tauri or a DB driver directly. This is what lets the web build reuse the same canvas/timeline view code:

- **Desktop**: routes through Tauri/native against live Neo4j (read + write).
- **Web read-layer**: `createStaticBundleTransport` serves all reads from an exported `GraphExportBundle` JSON dataset with no backend, and throws `read-only web build` on every mutation. `createReadLayerTransport(bundle)` selects it.

## Static export (web read-layer)

The desktop app performs a static export: it serializes Neo4j substance joined with SQLite layout into a self-contained `GraphExportBundle` (`graph-bundle.json`) via `export_graph_bundle_command`. The `public-viewer` app loads that bundle and renders the **canvas lens** (read-only) and the **timeline lens** (with archetypal lighting) from it — both through the same `WorkspaceTransport` read interface. A hosted read-only Neo4j is a later option behind the same seam; it is not required for v1.

## The two lenses

- **Canvas lens** shows **all** nodes (`loadCanvasView({ lens: "canvas" })`) — the trans-temporal, spatial view for building the archetypal/logical narrative.
- **Timeline lens** shows **only** temporally-located nodes (`loadCanvasView({ lens: "timeline" })`, server-filtered on `is_temporal`). Selecting a trans-temporal operator lights up every datable instance it `INSTANTIATES`/`ECHOES` across the timeline (archetypal lighting).

A node is the same full document in either lens; opening it is identical.

See `docs/data-model.md` for the graph ontology and `docs/setup.md` to run it.
