# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a dual-purpose repository:
1. **Research content** — episode specifications and research logs for a series on archetypes and civilizational power structures (in `ep-0.1/`, `ep-0.2/`, `antichrist-vault/`)
2. **Research Canvas app** — a local-first Tauri v2 desktop application for developing the theory of the *Image of the Antichrist* series as a knowledge graph, navigated through two lenses (a trans-temporal **canvas** and a temporal **timeline**), with a backend-less **web read-layer**.

The app is **substantially built**: Tauri v2 + React 19 + Vite 7 shell, an XYFlow canvas, an embedded terminal, the `WorkspaceTransport` seam, the static exporter, and the `public-viewer` web app all exist. The data model is being cut over to **Neo4j + Graphiti** (theory substance) joined with **SQLite** (layout only) by `graph_node_id`. The authoritative contracts live in `docs/superpowers/plans/2026-06-28-ws0-contracts-and-architecture.md`; the design is `docs/superpowers/specs/2026-06-28-antichrist-theory-tool-design.md`.

## Documentation

- `docs/setup.md` — clone-and-run: Docker + Neo4j + Graphiti, Gemini keys, terminal + MCP wiring.
- `docs/architecture.md` — the two-store model, the transport seam, the two lenses, the web read-layer.
- `docs/data-model.md` — entity + relationship types, the coordinate grammar, the seeded operators.

## Development Commands

Once the workspace is bootstrapped (Task 1):

```bash
# Install and type-check
pnpm install
pnpm exec tsc -b

# Run all frontend tests
pnpm vitest run

# Run a single frontend test file
pnpm vitest run packages/schema/src/index.test.ts
pnpm vitest run packages/canvas/src/state/canvasStore.test.ts

# Run Rust tests (always use --test-threads=1)
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml db_migrations -- --test-threads=1
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml canvas_repository -- --test-threads=1

# Run all Rust tests
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -- --test-threads=1

# E2E tests (Playwright)
pnpm playwright test tests/e2e/smoke.spec.ts
pnpm playwright test  # run all
```

## Architecture

### Monorepo Layout (planned)

```
apps/
  desktop/           # Tauri v2 desktop app
    src/             # React 18 + TypeScript frontend
      layout/        # Shell, LeftRail, CanvasPane, RightPanel, BottomDock
      features/      # projects, canvas, files, terminal, search, sequences, viewer
    src-tauri/       # Rust backend
      src/
        db/          # SQLite connection, migrations, repositories
        fs/          # File watcher and indexer
        pty/         # PTY session management (portable-pty)
        commands/    # IPC command handlers
        export/      # Static bundle generation
      migrations/    # SQL migration files
      tests/         # Rust integration tests
  public-viewer/     # Static web viewer (reuses shared packages, no backend)
packages/
  schema/            # Shared domain types (Project, Canvas, Node, Edge, Sequence, Annotation)
  canvas/            # React Flow canvas component library + state (canvasStore, AnnotationLayer, SequencePlayer)
  desktop-api/       # TypeScript client layer for Tauri IPC commands
  viewers/           # Markdown, PDF, Image, Note viewer components
  search/            # Fuzzy search + FTS query utilities
  exporter/          # Static bundle manifest, markdown rendering, asset copying
tests/
  e2e/               # Playwright E2E specs
  fixtures/          # Sample project for integration tests
```

### Key Subsystems

- **Canvas graph**: React Flow wired to `canvasStore` (Zustand), persisted via Rust `canvas.rs` commands into SQLite
- **Annotations**: `perfect-freehand` SVG layer rendered over the canvas, persisted as point arrays in SQLite
- **Sequences**: Ordered traversal steps on the same graph, each storing viewport state; used for guided playback in both desktop and static export
- **File indexing**: Rust `fs/indexer.rs` recursively walks real project directories; `fs/watcher.rs` keeps the index live
- **PTY terminal**: `portable-pty` backend in `pty/session.rs`, `xterm.js` frontend in `TerminalPane.tsx`, project-scoped working directory
- **Static export**: Rust `export/mod.rs` orchestrates manifest generation, markdown-to-HTML, graph/sequence serialization, search index output, and asset copying into a self-contained folder that the `public-viewer` app can open without a backend
- **FTS search**: SQLite FTS5 full-text index + frontend fuzzy ranking, exposed via keyboard-driven `CommandPalette`

### Data Persistence

Two stores, cleanly split, joined only by `graph_node_id` (an app-minted UUIDv4). **Neo4j + Graphiti** holds theory substance (node bodies, relationships, temporal validity, provenance); **SQLite** holds presentation only (position, size, style, viewport, app-state), each layout row keyed by `graph_node_id`. The join is performed in the Rust repository layer and re-exposed to the frontend already joined — never join across the database boundary in SQL. The frontend communicates exclusively through the `WorkspaceTransport` interface (`packages/desktop-api`); the web build swaps in a read-only static-bundle transport. Never bypass the repository/transport layer to reach a database directly from frontend code.

## Development Rules (from implementation plan)

- Use **test-first development** for every backend repository, frontend state model, and export behavior.
- Prefer **real integration tests** over mocked equivalents (real SQLite in temp dir, real fixture filesystem).
- Always run Rust tests with `--test-threads=1` to avoid SQLite contention.
- Treat the embedded terminal, freehand annotation layer, and static export as **core v1 scope**, not stretch goals.
- PDF is the supported deck format for v1.
- Keep file, folder, and package names exactly as specified in the implementation plan unless a documented change is necessary.
