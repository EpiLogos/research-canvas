# Research Canvas

Research Canvas is a private, local-first Tauri desktop application for building
research maps, timelines, documents, and theory graphs. Neo4j stores theory
substance; SQLite stores canvases, timelines, layouts, documents, and local
projection data. The public viewer is only a read-only/static export layer—it is
not the authoring application.

Each collaborator has an independent workspace on their own machine. There is
no account system, hosted database, cloud sync, collaborative editing, or
public Neo4j endpoint. Sharing code through Git does not share workspace data.

## What to install

- Git and [Git LFS](https://git-lfs.com/)
- Docker Desktop, or Docker Engine with Docker Compose v2
- Node.js 20 or newer and pnpm 10.25.0
- Rust stable through rustup
- Tauri v2 desktop prerequisites:
  - macOS: Xcode Command Line Tools
  - Linux: WebKitGTK 4.1 and the standard Tauri development packages

On a new machine, enable the repository’s pnpm version with:

```bash
corepack enable
corepack prepare pnpm@10.25.0 --activate
```

## Clone and start

Clone the private repository URL supplied by the owner, then:

```bash
git clone <private-repository-url> research-canvas
cd research-canvas
git lfs install
git lfs pull
./scripts/research-canvas start
```

On the first run, `start` creates `.env` from `.env.example` and stops. Open
`.env`, set a new local `NEO4J_PASSWORD`, then run the same command again:

```bash
./scripts/research-canvas start
```

The command checks Docker, Compose, Node, pnpm, Rust, and desktop prerequisites;
installs locked JavaScript dependencies when needed; starts Neo4j; waits for an
authenticated Cypher query to succeed; and launches the desktop app. Neo4j’s
HTTP and Bolt ports bind only to `127.0.0.1`.

Stop services without deleting local data:

```bash
./scripts/research-canvas stop
```

## Restore the author’s starter workspace

The private GitHub Release `partner-starter-v1` contains:

- `research-canvas-workspace-v1-….tar.gz`
- its `.sha256` file
- its `.manifest.json` file

Download the archive from the repository’s Releases page. After setting your
own `NEO4J_PASSWORD` in `.env`, restore it before creating local work:

```bash
./scripts/research-canvas restore ~/Downloads/research-canvas-workspace-v1-….tar.gz
./scripts/research-canvas start
```

Restore validates the archive, internal checksums, SQLite integrity/counts, and
Neo4j counts before reporting success. It restores only the `neo4j` graph
database, so the author’s credentials are never transferred. It refuses an
existing SQLite workspace, populated Neo4j graph, or conflicting vault payload.
To deliberately replace an existing local workspace:

```bash
./scripts/research-canvas restore <snapshot-archive> --replace
```

`--replace` is destructive for the current local SQLite/Neo4j workspace. Make a
backup first.

## Local data locations

The normal SQLite database is:

- macOS: `~/Library/Application Support/research-canvas/workspace/research-canvas-authoring.sqlite`
- Linux: `${XDG_DATA_HOME:-~/.local/share}/research-canvas/workspace/research-canvas-authoring.sqlite`
- Windows: `%LOCALAPPDATA%\research-canvas\workspace\research-canvas-authoring.sqlite`

Neo4j uses the established local Docker volume
`antichristproject_neo4j_data`. Vault source and
required assets live in `antichrist-vault/` in the clone.

Advanced overrides:

- `RESEARCH_CANVAS_DATA_DIR`: directory containing the normal SQLite database
- `RESEARCH_CANVAS_DATABASE_PATH`: exact SQLite database file

The first normal startup safely copies the old
`$TMPDIR/research-canvas-authoring.sqlite` database into the persistent location
only when the destination does not exist. It never overwrites a persistent
database and leaves the legacy source in place.

## Backup, restore, and verification

Create a versioned portable workspace snapshot outside the repository:

```bash
./scripts/research-canvas backup ~/Research-Canvas-Backups
```

The command uses SQLite’s online backup API, makes a real Neo4j 5.26 dump,
restarts Neo4j after the dump, records versions and record counts, checks every
payload with SHA-256, and emits one `.tar.gz` plus sibling checksum/manifest
files. Database dumps, archives, Docker volumes, `.env`, dependencies, virtual
environments, and build output are ignored by Git.

Check the current local services and data:

```bash
./scripts/research-canvas verify
```

Run automated checks:

```bash
pnpm install --frozen-lockfile
pnpm test:handoff:contracts
cargo test --locked --manifest-path apps/desktop/src-tauri/Cargo.toml -- --test-threads=1
pnpm test:graph:integration
pnpm test:handoff:integration
pnpm typecheck
pnpm test
pnpm build
```

`test:handoff:integration` uses real disposable Neo4j volumes and a real SQLite
workspace. It inserts nodes, relationships, canvas/timeline layouts, and a
document; backs them up; restores into clean isolated services with different
credentials; and queries selected records and counts after restore. Add
`--desktop-smoke` through `pnpm test:handoff:desktop` when a graphical desktop
session is available.

## Common failures

- **Docker unavailable:** start Docker Desktop (or the Docker daemon), then run
  `docker compose version`.
- **Missing password:** set a non-empty `NEO4J_PASSWORD` in `.env`; do not commit
  that file.
- **Neo4j not ready:** run `./scripts/research-canvas verify`. The command prints
  recent container logs if an authenticated query does not succeed in time.
- **Missing pnpm:** run the Corepack commands in “What to install”.
- **Missing Rust/Tauri prerequisites:** install Rust stable and follow the
  [Tauri prerequisite guide](https://v2.tauri.app/start/prerequisites/) for the
  operating system.
- **Port already in use:** change `RESEARCH_CANVAS_NEO4J_HTTP_PORT`,
  `RESEARCH_CANVAS_NEO4J_BOLT_PORT`, and `NEO4J_URI` together in `.env`, keeping
  the URI on `127.0.0.1`.

See [docs/architecture.md](docs/architecture.md) for system boundaries and
[docs/data-model.md](docs/data-model.md) for the graph ontology. This private
repository is governed by the proprietary [LICENSE](LICENSE).
