# Local setup

The authoritative partner runbook is the repository [README](../README.md).
Research Canvas is local-first: the desktop app uses a persistent local SQLite
file and a loopback-only Neo4j 5.26 Community container. A clone does not contain
or synchronize workspace database data.

## Start and stop

Install Node 20+, pnpm 10.25.0, Rust stable, Docker Compose v2, Git LFS, and the
Tauri v2 prerequisites for the operating system. Then run:

```bash
./scripts/research-canvas start
```

If `.env` is absent, the command creates it from `.env.example` and stops. Set
`NEO4J_PASSWORD`, then run `start` again. Neo4j is ready only after an
authenticated `RETURN 1` query succeeds—not merely when its container is
running. The default Bolt URI is `bolt://127.0.0.1:17687`; the browser UI is
`http://127.0.0.1:17474`.

```bash
./scripts/research-canvas stop
```

`stop` preserves the `antichristproject_neo4j_data` volume and the local SQLite
workspace.

## Data and snapshots

The normal SQLite file is below the operating system’s local application-data
directory at
`research-canvas/workspace/research-canvas-authoring.sqlite`. Set
`RESEARCH_CANVAS_DATA_DIR` to override its containing directory or
`RESEARCH_CANVAS_DATABASE_PATH` to override the exact file. Tests use explicit
temporary paths and never use the normal workspace.

An old `$TMPDIR/research-canvas-authoring.sqlite` is copied once with SQLite’s
backup API only if the persistent destination does not exist. The source remains
untouched.

```bash
./scripts/research-canvas backup ~/Research-Canvas-Backups
./scripts/research-canvas restore <snapshot-archive>
./scripts/research-canvas verify
```

Snapshots contain a Neo4j dump, a consistent SQLite backup, any vault payload
not supplied by Git, `manifest.json`, and `checksums.sha256`. Restore validates
all payloads and record counts before mutation and refuses occupied destinations
unless `--replace` is supplied deliberately. Neo4j credentials are local and are
not part of the dump.

## Real integration tests

```bash
pnpm test:graph:integration
pnpm test:handoff:integration
```

Both commands use real disposable Neo4j services. The handoff test also uses a
real migrated SQLite schema, performs a complete dump/archive/restore cycle,
uses a different recipient password, and verifies selected graph, document,
canvas, and timeline records. With a graphical session, run
`pnpm test:handoff:desktop` to include the desktop launch smoke test.

The optional Graphiti research-agent setup remains documented in
[setup/graphiti-mcp.md](setup/graphiti-mcp.md). It is not required for the
partner to start the desktop authoring application.

For that optional integration, `.env.example` also documents `NEO4J_URI`,
`GOOGLE_API_KEY`, and `GRAPHITI_LLM_MODEL` (default `gemini-2.5-flash`).
Graphiti MCP uses the same local service defined in `docker-compose.yml`; it
does not turn Neo4j into a public or hosted endpoint.
