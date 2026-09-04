#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$repo_root/docker-compose.test.yml"
project_name="antichrist-graph-test-${PPID}-$$"
run_namespace="graph_it_$(date -u +%Y%m%dT%H%M%S)_$$"
test_password=""
sentinel_token=""

graph_targets=(
  agent_context_pack
  agent_graph_curation
  neo4j_connect
  graph_schema
  graph_node_crud
  graph_node_evidence_patch
  graph_node_update_delete
  graph_list_nodes
  graph_relationships
  graph_search_context
  graph_lighting
  canvas_view_join
  graph_seed_operators
  graph_node_client_id
  ws4a_cutover_roundtrip
  encapsulation_roundtrip
  graph_bundle_lighting_index
  root_archetypal_field_seed
  graph_test_harness
  content_sync_cas
)

compose() {
  docker compose --project-name "$project_name" --file "$compose_file" "$@"
}

cleanup() {
  local status=$?
  trap - EXIT
  if [[ -n "$test_password" ]]; then
    export NEO4J_TEST_PASSWORD="$test_password"
    if [[ "$status" -ne 0 ]]; then
      compose logs --no-color neo4j-test >&2 || true
    fi
    compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  fi
  exit "$status"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

command -v docker >/dev/null 2>&1 || {
  echo "docker is required for the real graph integration suite" >&2
  exit 1
}
command -v openssl >/dev/null 2>&1 || {
  echo "openssl is required to generate disposable graph-test credentials" >&2
  exit 1
}
command -v rg >/dev/null 2>&1 || {
  echo "rg is required to verify graph integration target coverage" >&2
  exit 1
}
docker compose version >/dev/null

listed_targets=" ${graph_targets[*]} "
while IFS= read -r source_file; do
  target="$(basename "$source_file" .rs)"
  if [[ "$listed_targets" != *" $target "* ]]; then
    echo "graph test target '$target' calls neo4j_test_graph() but is absent from the wrapper" >&2
    exit 1
  fi
done < <(rg --files-with-matches 'support::neo4j_test_graph\(\)' \
  "$repo_root/apps/desktop/src-tauri/tests" --glob '*.rs')

test_password="$(openssl rand -hex 24)"
sentinel_token="$(openssl rand -hex 32)"
export NEO4J_TEST_PASSWORD="$test_password"

compose up --detach --wait neo4j-test
container_id="$(compose ps --quiet neo4j-test)"
if [[ -z "$container_id" ]]; then
  echo "dedicated Neo4j test container did not start" >&2
  exit 1
fi

container_role="$(docker inspect --format '{{ index .Config.Labels "org.antichrist-project.role" }}' "$container_id")"
if [[ "$container_role" != "graph-integration-test" ]]; then
  echo "refusing container without the graph-integration-test identity label" >&2
  exit 1
fi

published_bolt="$(compose port neo4j-test 7687)"
test_bolt_port="${published_bolt##*:}"
if [[ ! "$test_bolt_port" =~ ^[0-9]+$ ]]; then
  echo "could not discover the dedicated container's dynamic Bolt port: $published_bolt" >&2
  exit 1
fi

docker exec "$container_id" cypher-shell \
  -a bolt://127.0.0.1:7687 \
  -d neo4j \
  -u neo4j \
  -p "$test_password" \
  "CREATE (:GraphTestHarnessIdentity {identity: 'antichrist-graph-integration-test', token: '$sentinel_token'});" \
  >/dev/null

export NEO4J_TEST_URI="bolt://127.0.0.1:${test_bolt_port}"
export NEO4J_TEST_INSTANCE="antichrist-neo4j-integration"
export NEO4J_TEST_USER="neo4j"
export NEO4J_TEST_DATABASE="neo4j"
export NEO4J_TEST_RUN_NAMESPACE="$run_namespace"
export NEO4J_TEST_SENTINEL_TOKEN="$sentinel_token"
# rustc on macOS can exhaust its default codegen stack while several agents
# build this crate concurrently. Keep the integration command deterministic.
export RUST_MIN_STACK="${RUST_MIN_STACK:-16777216}"
export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-2}"
export CARGO_PROFILE_TEST_DEBUG="${CARGO_PROFILE_TEST_DEBUG:-0}"

cargo test --locked \
  --manifest-path "$repo_root/apps/desktop/src-tauri/Cargo.toml" \
  --all-targets \
  -- \
  --test-threads=1
