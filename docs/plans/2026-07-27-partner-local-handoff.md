# Partner Local Handoff Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Research Canvas safely cloneable, locally runnable, backupable, restorable, and privately publishable with a verified author starter workspace.

**Architecture:** Keep authoring local: Tauri and SQLite use one canonical per-user data directory, while Neo4j remains a loopback-only Docker Compose service. A repository-owned command delegates SQLite-safe operations to the Rust crate and Neo4j lifecycle/dump operations to the pinned application image, producing a checksummed, versioned archive that never contains credentials. Restore validates everything before mutation and refuses occupied destinations unless `--replace` is explicit.

**Tech Stack:** Bash, Docker Compose, Neo4j 5.26 Community, Rust 2021, rusqlite backup API, Node.js/pnpm, Tauri v2, SHA-256, tar/gzip.

---

## Design decision

Three approaches were considered:

1. **Repository shell command plus a small Rust SQLite utility (selected).** This reuses Docker Compose and the application’s bundled SQLite library, requires no extra SQLite CLI, and makes migration/backup/count behavior directly testable in Rust.
2. A shell-only workflow using the host `sqlite3` command. This is simpler internally but adds an undocumented partner prerequisite and makes platform behavior less reliable.
3. A large all-Rust orchestration binary controlling Docker. This gives strong typing but duplicates mature Compose behavior and increases maintenance without improving the local-only boundary.

The selected approach keeps the public interface memorable while placing database correctness in Rust and service lifecycle operations in Compose.

### Task 1: Durable workspace path

**Files:**
- Create: `apps/desktop/src-tauri/src/workspace.rs`
- Create: `apps/desktop/src-tauri/tests/workspace_path.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/src/commands/constellations.rs`

1. Write tests for platform data-directory resolution, explicit database override, isolated session/test paths, one-time legacy backup migration, and refusal when the destination exists.
2. Run `cargo test --offline --manifest-path apps/desktop/src-tauri/Cargo.toml --test workspace_path -- --test-threads=1` and confirm failure because the API does not exist.
3. Implement path resolution and migration with `rusqlite::backup`, preserving the legacy source.
4. Run the focused test and the existing SQLite/Rust suite.

### Task 2: Workspace SQLite utility

**Files:**
- Create: `apps/desktop/src-tauri/src/bin/workspace_sqlite.rs`
- Create: `apps/desktop/src-tauri/tests/workspace_sqlite_cli.rs`
- Modify: `apps/desktop/src-tauri/Cargo.toml`

1. Write CLI tests for path reporting, consistent backup, integrity checking, counts, destination refusal, and explicit replacement.
2. Confirm they fail before the binary exists.
3. Implement commands using the same workspace module and real SQLite files.
4. Run focused tests and verify copied record values.

### Task 3: Local command interface and snapshot format

**Files:**
- Create: `scripts/research-canvas`
- Create: `scripts/workspace-manifest.mjs`
- Create: `scripts/test-workspace-handoff.sh`
- Create: `docker-compose.handoff-test.yml`
- Modify: `docker-compose.yml`
- Modify: `.env.example`
- Modify: `.gitignore`

1. Add contract tests that exercise help/errors without Docker and a real handoff test that starts a disposable Neo4j, inserts real graph and SQLite records, backs up, restores to a separate Compose project/data directory, and queries both stores.
2. Bind application ports to `127.0.0.1`, add authenticated query health checks, and label the volume/service for safe targeting.
3. Implement `start`, `stop`, `backup`, `restore`, and `verify`; use an actual `RETURN 1` query for readiness.
4. Build archives rooted at `research-canvas-workspace-v1/` with payload checksums and a manifest containing format/image versions and actual counts.
5. Validate paths and checksums before restore; reject traversal and occupied targets; retain recipient credentials by restoring only the `neo4j` database dump.

### Task 4: Publishability and partner documentation

**Files:**
- Modify: `.gitignore`
- Create: `.gitattributes`
- Create: `LICENSE`
- Modify: `README.md`
- Modify: `docs/setup.md`

1. Ignore generated builds, dependencies, Python environments/caches, local data, dumps, archives, and backups.
2. Track only required large source media with Git LFS when it improves clone safety; keep all database artifacts out of history.
3. Document prerequisites, exact commands, data paths, independent local workspaces, starter snapshot restore, and failure recovery.
4. Run secret, ignored-file, tracked-size, documentation-command, type, unit, Rust, and build audits.

### Task 5: Real author snapshot and private publication

1. Run the command’s real integration verification against disposable services.
2. Migrate the real legacy author SQLite database safely to the canonical location and create the author snapshot from the current real Neo4j and SQLite stores.
3. Restore that archive into isolated clean destinations and compare manifest counts plus selected records.
4. Inspect all pre-existing and new worktree changes, stage intentionally, commit, and push to a newly created private GitHub repository.
5. Create `partner-starter-v1`, upload the archive plus manifest/checksum assets, and repeat restore/start verification from a clean clone.
