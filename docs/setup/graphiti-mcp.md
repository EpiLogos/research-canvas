# Graphiti MCP — theory authoring path

The terminal coding agent (Claude Code / Codex) authors theory **substance** into the
same local Neo4j the desktop app reads. It does this through the **external official
Graphiti MCP server** (Python), not through this repo's `research-canvas` MCP (which is
slimmed to a place-on-canvas / layout role — see WS6).

## What writes what

- **Graphiti MCP** → `graphiti-core` → official Neo4j Python driver → bolt → Neo4j.
  Owns entity extraction, dedup, bi-temporal bookkeeping, embeddings.
- **Desktop app (Rust)** → `neo4rs` → bolt → same Neo4j. Owns fast CRUD + projection.

Both write the labels/properties/relationships in
`docs/superpowers/plans/2026-06-28-ws0-contracts-and-architecture.md` §2, so a node
authored by Graphiti is readable by the app and vice-versa. The single join key is
`graph_node_id` (app-minted UUIDv4); the app stores layout for it in SQLite.

## Prerequisites

1. Neo4j running: `docker compose up -d neo4j` (see repo-root `docker-compose.yml`).
2. A `.env` at repo root (copy `.env.example`) with `NEO4J_PASSWORD` and `GOOGLE_API_KEY` set.

## Models (resolved, OQ-2)

| Role | Model id | Env var |
|---|---|---|
| LLM | `gemini-2.5-flash` | `GRAPHITI_LLM_MODEL` |
| Embedder | `gemini-embedding-001` | `GRAPHITI_EMBEDDER_MODEL` |
| Reranker (optional) | `gemini-2.5-flash-lite` | `GRAPHITI_RERANKER_MODEL` |

Never use `-preview-*` model ids (deprecated upstream). A local-embedder fallback is
conceptually available for a no-metered-API mode.

## Running the MCP

The Graphiti MCP server is an external package; install and run it per its upstream
README, pointing it at this repo's `.env`:

```bash
set -a && . ./.env && set +a
# Graphiti reads NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD / NEO4J_DATABASE and
# GOOGLE_API_KEY / GRAPHITI_LLM_MODEL / GRAPHITI_EMBEDDER_MODEL from the environment.
# Start the official Graphiti MCP server (uvx / pipx / docker per upstream docs).
```

Register it with the terminal agent as an MCP server. Custom entity types (Figure,
People, Event, Institution, Source, Place, Work, Archetype, Dynamic) and relationship
types (INSTANTIATES, ECHOES, CAUSES, INFLUENCES, OPPOSES, INHERITS, TRANSFORMS_INTO,
LOCATED_AT, SOURCED_FROM, RESONATES_WITH) match WS0 §2.

## Seeded operators

Canonical psychoid/MEF/Archetype operator nodes are loaded by the app's
`GraphRepository::seed_operators` from `apps/desktop/src-tauri/seeds/operators.seed.json`
as `:Operator` nodes (NOT `:TheoryNode`). The mechanism that mirrors the canonical
Epi-Logos source into that manifest is deferred (design OQ-1); only the JSON is
regenerated when that lands — no app code changes.
