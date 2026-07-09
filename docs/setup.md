# Setup

This is a local-first tool. Distribution is "clone the repo and run it" — there are no packaged installers. This document gets a fresh machine to a running desktop app with a live Neo4j graph and the research agent wired in.

## Prerequisites

- Node 20+ and `pnpm` 10+ (`corepack enable` then `corepack prepare pnpm@10.25.0 --activate`).
- Rust toolchain (`rustup`, stable) and the Tauri v2 system dependencies for your OS.
- Docker + Docker Compose (for Neo4j).
- Python 3.11+ (for the Graphiti MCP server).
- A Google Gemini API key.

## 1. Install JS dependencies

```bash
pnpm install
```

## 2. Environment

Copy the example env file and fill in the secrets. `.env` is git-ignored; `.env.example` is committed with blanks.

```bash
cp .env.example .env
```

| Env var | Default | Used by |
|---|---|---|
| `NEO4J_URI` | `bolt://127.0.0.1:17687` | Rust app (`neo4rs`), Graphiti MCP |
| `NEO4J_USER` | `neo4j` | both |
| `NEO4J_PASSWORD` | (required, set your own) | both |
| `NEO4J_DATABASE` | `neo4j` | both |
| `GOOGLE_API_KEY` | (required for Graphiti) | Graphiti MCP only |
| `GRAPHITI_LLM_MODEL` | `gemini-2.5-flash` | Graphiti MCP only |
| `GRAPHITI_EMBEDDER_MODEL` | `gemini-embedding-001` | Graphiti MCP only |
| `GRAPHITI_RERANKER_MODEL` | `gemini-2.5-flash-lite` | Graphiti MCP only |

Both the Tauri app and the Graphiti MCP server load this same `.env`.

## 3. Start Neo4j (Docker)

The repo ships a single-service `docker-compose.yml` at its root:

```bash
docker compose up -d neo4j
```

This starts `neo4j:5.26-community` with APOC enabled, exposing the browser UI on `http://127.0.0.1:17474` and the bolt protocol on `127.0.0.1:17687`. Graphiti requires Neo4j 5.26+.

## 4. Run the desktop app

```bash
pnpm launch
```

On startup the app connects to Neo4j over bolt via `neo4rs`, runs the idempotent schema setup (constraints + indexes), and reads layout from local SQLite.

## 5. Wire the research agent (terminal + MCP)

Theory authoring is done by a terminal coding agent (Claude Code / Codex) running on your existing subscription, through two MCP servers:

- **Graphiti MCP** (Python, external) is the agent's theory-write path. It runs Graphiti's ingestion pipeline (Gemini LLM + embeddings) and writes nodes/episodes/relationships with provenance into the same Neo4j database. Configure it with the `NEO4J_*`, `GOOGLE_API_KEY`, and `GRAPHITI_*` env vars above.
- **research-canvas MCP** (this repo, `.claude/mcp-servers/research-canvas`) is slimmed to a place-on-canvas / layout role. It does not author theory; it places existing graph nodes (by `graphNodeId`) onto the canvas/timeline and reads/updates their layout. Its HTTP API listens on `http://127.0.0.1:9876`.

The agent loop: research with Graphiti MCP (which writes substance), then place new nodes on the canvas/timeline with the research-canvas MCP, then review and refine in the desktop UI.

## 6. Verify

```bash
pnpm exec tsc -b
pnpm vitest run
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -- --test-threads=1
```

See `docs/architecture.md` for how the pieces fit together and `docs/data-model.md` for the graph ontology.
