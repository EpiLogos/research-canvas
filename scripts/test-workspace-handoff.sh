#!/bin/bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
command="$repo_root/scripts/research-canvas"
compose_file="$repo_root/docker-compose.yml"
desktop_smoke=0
if [[ "${1:-}" == "--desktop-smoke" ]]; then
  desktop_smoke=1
elif [[ -n "${1:-}" ]]; then
  printf 'usage: %s [--desktop-smoke]\n' "$0" >&2
  exit 2
fi

for required in docker sqlite3 cargo node; do
  command -v "$required" >/dev/null 2>&1 || {
    printf '%s is required for the real handoff integration test\n' "$required" >&2
    exit 1
  }
done
docker compose version >/dev/null

test_root="$(mktemp -d "${TMPDIR:-/tmp}/research-canvas-handoff.XXXXXX")"
source_project="research-canvas-handoff-source-$$"
target_project="research-canvas-handoff-target-$$"
source_volume="research-canvas-handoff-source-data-$$"
source_logs_volume="research-canvas-handoff-source-logs-$$"
target_volume="research-canvas-handoff-target-data-$$"
target_logs_volume="research-canvas-handoff-target-logs-$$"
source_http_port="$((24000 + ($$ % 1000) * 4))"
source_bolt_port="$((source_http_port + 1))"
target_http_port="$((source_http_port + 2))"
target_bolt_port="$((source_http_port + 3))"
source_database="$test_root/source/research-canvas-authoring.sqlite"
target_database="$test_root/target/research-canvas-authoring.sqlite"
source_env="$test_root/source.env"
target_env="$test_root/target.env"
archive_directory="$test_root/snapshots"
desktop_pid=""

compose_for() {
  local project="$1"
  local env_file="$2"
  shift 2
  docker compose \
    --project-name "$project" \
    --env-file "$env_file" \
    --file "$compose_file" \
    "$@"
}

cleanup() {
  local status=$?
  trap - EXIT
  if [[ -n "$desktop_pid" ]]; then
    kill "$desktop_pid" >/dev/null 2>&1 || true
    wait "$desktop_pid" >/dev/null 2>&1 || true
  fi
  if [[ "$status" -ne 0 ]]; then
    printf 'source Neo4j logs:\n' >&2
    compose_for "$source_project" "$source_env" logs --no-color --tail 160 neo4j >&2 || true
    printf 'target Neo4j logs:\n' >&2
    compose_for "$target_project" "$target_env" logs --no-color --tail 160 neo4j >&2 || true
  fi
  compose_for "$source_project" "$source_env" down --remove-orphans >/dev/null 2>&1 || true
  compose_for "$target_project" "$target_env" down --remove-orphans >/dev/null 2>&1 || true
  docker volume rm \
    "$source_volume" "$source_logs_volume" "$target_volume" "$target_logs_volume" \
    >/dev/null 2>&1 || true
  if [[ "$status" -ne 0 ]]; then
    printf 'handoff integration artifacts retained at %s\n' "$test_root" >&2
  else
    rm -rf "$test_root"
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'printf "handoff integration failed at line %s\n" "$LINENO" >&2' ERR
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p "$(dirname "$source_database")" "$(dirname "$target_database")" "$archive_directory"
cat >"$source_env" <<EOF
NEO4J_URI=bolt://127.0.0.1:$source_bolt_port
NEO4J_USER=neo4j
NEO4J_PASSWORD=source-handoff-password-$$
NEO4J_DATABASE=neo4j
RESEARCH_CANVAS_DATABASE_PATH=$source_database
RESEARCH_CANVAS_NEO4J_HTTP_PORT=$source_http_port
RESEARCH_CANVAS_NEO4J_BOLT_PORT=$source_bolt_port
RESEARCH_CANVAS_NEO4J_VOLUME=$source_volume
RESEARCH_CANVAS_NEO4J_LOGS_VOLUME=$source_logs_volume
EOF
cat >"$target_env" <<EOF
NEO4J_URI=bolt://127.0.0.1:$target_bolt_port
NEO4J_USER=neo4j
NEO4J_PASSWORD=recipient-owned-password-$$
NEO4J_DATABASE=neo4j
RESEARCH_CANVAS_DATABASE_PATH=$target_database
RESEARCH_CANVAS_NEO4J_HTTP_PORT=$target_http_port
RESEARCH_CANVAS_NEO4J_BOLT_PORT=$target_bolt_port
RESEARCH_CANVAS_NEO4J_VOLUME=$target_volume
RESEARCH_CANVAS_NEO4J_LOGS_VOLUME=$target_logs_volume
EOF

cargo run --quiet --locked \
  --manifest-path "$repo_root/apps/desktop/src-tauri/Cargo.toml" \
  --bin workspace_sqlite \
  -- initialize "$source_database" >/dev/null

sqlite3 "$source_database" <<EOF
PRAGMA foreign_keys = ON;
INSERT INTO projects (
  id, display_name, slug, root_path, summary, publish_settings
) VALUES (
  'handoff-project', 'Handoff Project', 'handoff-project',
  '$repo_root/antichrist-vault', 'Real integration workspace', '{}'
);
INSERT INTO canvases (
  id, project_id, name, kind, summary, is_primary
) VALUES (
  'handoff-canvas', 'handoff-project', 'Handoff Canvas',
  'primary', 'Canvas restored through the handoff test', 1
);
UPDATE projects SET primary_canvas_id = 'handoff-canvas' WHERE id = 'handoff-project';
INSERT INTO graph_node_metadata (
  graph_node_id, entity_type, title, content_origin, content_revision,
  schema_version, sync_state, is_temporal, valid_from, temporal_precision
) VALUES
  ('handoff-node-a', 'Claim', 'Handoff source claim', 'user_authored', 1, 1, 'synced', 1, '2026-07-27', 'day'),
  ('handoff-node-b', 'Source', 'Handoff supporting source', 'user_authored', 1, 1, 'synced', 0, NULL, NULL);
INSERT INTO graph_relationship (
  relationship_id, source_graph_node_id, target_graph_node_id, rel_type,
  origin, sync_state, relationship_revision
) VALUES (
  'handoff-relationship', 'handoff-node-b', 'handoff-node-a',
  'SUPPORTS', 'user_authored', 'synced', 1
);
INSERT INTO node_layout (
  graph_node_id, canvas_id, position_x, position_y, width, height, style_json
) VALUES
  ('handoff-node-a', 'handoff-canvas', 120.0, 220.0, 320.0, 180.0, '{"color":"green"}'),
  ('handoff-node-b', 'handoff-canvas', 560.0, 220.0, 300.0, 160.0, '{}');
INSERT INTO timeline_layout (
  graph_node_id, lane, offset_y, width, height, style_json, layout_revision
) VALUES (
  'handoff-node-a', 'claims', 42.0, 320.0, 180.0, '{"emphasis":"high"}', 1
);
INSERT INTO edge_layout (
  id, canvas_id, source_graph_node_id, target_graph_node_id, relation_kind, style_json
) VALUES (
  'handoff-edge', 'handoff-canvas', 'handoff-node-b', 'handoff-node-a', 'SUPPORTS', '{}'
);
INSERT INTO canvas_app_state (
  canvas_id, viewport_json, app_state_json
) VALUES (
  'handoff-canvas', '{"x":11,"y":17,"zoom":0.85}', '{"lens":"timeline"}'
);
INSERT INTO node_document (
  graph_node_id, body, summary, updated_at, neo4j_synced,
  content_origin, content_revision, body_source_coordinates_json
) VALUES (
  'handoff-node-a', 'The selected integration document survived backup and restore.',
  'Integration document', '2026-07-27T12:00:00Z', 1,
  'user_authored', 1, '["integration:document"]'
);
EOF

RESEARCH_CANVAS_ENV_FILE="$source_env" \
RESEARCH_CANVAS_COMPOSE_PROJECT="$source_project" \
  "$command" verify >/dev/null

source_container="$(compose_for "$source_project" "$source_env" ps --quiet neo4j)"
source_password="source-handoff-password-$$"
docker exec "$source_container" cypher-shell \
  -a bolt://127.0.0.1:7687 -d neo4j -u neo4j -p "$source_password" \
  "CREATE (claim:Claim {id:'handoff-claim', title:'Handoff source claim', sentinel:'source-selected-record'})
   CREATE (source:Source {id:'handoff-source', title:'Handoff supporting source'})
   CREATE (source)-[:SUPPORTS {evidence:'integration'}]->(claim);" >/dev/null

backup_output="$(
  RESEARCH_CANVAS_ENV_FILE="$source_env" \
  RESEARCH_CANVAS_COMPOSE_PROJECT="$source_project" \
    "$command" backup "$archive_directory"
)"
archive="$(printf '%s\n' "$backup_output" | sed -n 's/^SNAPSHOT_ARCHIVE=//p' | tail -n 1)"
[[ -n "$archive" && -s "$archive" ]] || {
  printf 'backup did not return a usable snapshot archive\n%s\n' "$backup_output" >&2
  exit 1
}

RESEARCH_CANVAS_ENV_FILE="$target_env" \
RESEARCH_CANVAS_COMPOSE_PROJECT="$target_project" \
  "$command" restore "$archive" >/dev/null

sqlite_document="$(
  sqlite3 "$target_database" \
    "SELECT body FROM node_document WHERE graph_node_id = 'handoff-node-a';"
)"
[[ "$sqlite_document" == "The selected integration document survived backup and restore." ]] || {
  printf 'restored SQLite selected record did not match\n' >&2
  exit 1
}
sqlite_counts="$(
  sqlite3 "$target_database" \
    "SELECT
       (SELECT count(*) FROM projects) || ',' ||
       (SELECT count(*) FROM node_layout) || ',' ||
       (SELECT count(*) FROM timeline_layout) || ',' ||
       (SELECT count(*) FROM graph_relationship) || ',' ||
       (SELECT count(*) FROM node_document);"
)"
[[ "$sqlite_counts" == "1,2,1,1,1" ]] || {
  printf 'restored SQLite counts did not match: %s\n' "$sqlite_counts" >&2
  exit 1
}
rebased_root="$(
  sqlite3 "$target_database" \
    "SELECT root_path FROM projects WHERE id = 'handoff-project';"
)"
[[ "$rebased_root" == "$repo_root/antichrist-vault" ]] || {
  printf 'restored repository root was not rebased: %s\n' "$rebased_root" >&2
  exit 1
}

target_container="$(compose_for "$target_project" "$target_env" ps --quiet neo4j)"
target_password="recipient-owned-password-$$"
neo4j_selected="$(
  docker exec "$target_container" cypher-shell \
    -a bolt://127.0.0.1:7687 -d neo4j -u neo4j -p "$target_password" \
    --format plain \
    "MATCH (n {id:'handoff-claim'}) RETURN n.sentinel AS sentinel;" |
    tail -n 1 | tr -d '"[:space:]'
)"
[[ "$neo4j_selected" == "source-selected-record" ]] || {
  printf 'restored Neo4j selected record did not match: %s\n' "$neo4j_selected" >&2
  exit 1
}
credential_probe="$(
  docker exec "$target_container" cypher-shell \
    -a bolt://127.0.0.1:7687 -d system -u neo4j -p "$target_password" \
    --format plain \
    "SHOW CURRENT USER YIELD user RETURN user;" |
    tail -n 1 | tr -d '"[:space:]'
)"
[[ "$credential_probe" == "neo4j" ]] || {
  printf 'recipient Neo4j credentials were not retained\n' >&2
  exit 1
}

if [[ "$desktop_smoke" -eq 1 ]]; then
  RESEARCH_CANVAS_ENV_FILE="$target_env" \
  RESEARCH_CANVAS_COMPOSE_PROJECT="$target_project" \
    "$command" start >"$test_root/desktop.log" 2>&1 &
  desktop_pid=$!
  desktop_ready=0
  for _ in $(seq 1 120); do
    if ! kill -0 "$desktop_pid" >/dev/null 2>&1; then
      break
    fi
    if curl -sS --max-time 2 http://127.0.0.1:9876/api/canvas >/dev/null 2>&1; then
      desktop_ready=1
      break
    fi
    sleep 2
  done
  if [[ "$desktop_ready" -ne 1 ]]; then
    printf 'desktop startup smoke test failed\n' >&2
    sed -n '1,240p' "$test_root/desktop.log" >&2
    exit 1
  fi
  kill "$desktop_pid" >/dev/null 2>&1 || true
  wait "$desktop_pid" >/dev/null 2>&1 || true
  desktop_pid=""
fi

printf 'Real handoff integration passed: SQLite, Neo4j, manifest, credentials, and selected records match.\n'
