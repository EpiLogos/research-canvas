#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$repo_root/docker-compose.test.yml"
project_name="antichrist-graph-test-${PPID}-$$"
test_password="antichrist-integration-pw"
test_bolt_port="${NEO4J_TEST_BOLT_PORT:-27687}"
run_namespace="graph_it_$(date -u +%Y%m%dT%H%M%S)_$$"

compose() {
  docker compose --project-name "$project_name" --file "$compose_file" "$@"
}

cleanup() {
  local status=$?
  trap - EXIT
  if [[ "$status" -ne 0 ]]; then
    compose logs --no-color neo4j-test >&2 || true
  fi
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
  exit "$status"
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

command -v docker >/dev/null 2>&1 || {
  echo "docker is required for the real graph integration suite" >&2
  exit 1
}
docker compose version >/dev/null

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

export NEO4J_TEST_URI="bolt://127.0.0.1:${test_bolt_port}"
export NEO4J_TEST_INSTANCE="antichrist-neo4j-integration"
export NEO4J_TEST_USER="neo4j"
export NEO4J_TEST_PASSWORD="$test_password"
export NEO4J_TEST_DATABASE="neo4j"
export NEO4J_TEST_RUN_NAMESPACE="$run_namespace"
# rustc on macOS can exhaust its default codegen stack while several agents
# build this crate concurrently. Keep the integration command deterministic.
export RUST_MIN_STACK="${RUST_MIN_STACK:-16777216}"
export CARGO_BUILD_JOBS="${CARGO_BUILD_JOBS:-2}"
export CARGO_PROFILE_TEST_DEBUG="${CARGO_PROFILE_TEST_DEBUG:-0}"

cargo test --offline \
  --manifest-path "$repo_root/apps/desktop/src-tauri/Cargo.toml" \
  --test neo4j_connect \
  --test graph_schema \
  --test graph_node_crud \
  --test graph_node_update_delete \
  --test graph_list_nodes \
  --test graph_relationships \
  --test graph_lighting \
  --test canvas_view_join \
  --test graph_seed_operators \
  --test graph_node_client_id \
  --test ws4a_cutover_roundtrip \
  --test graph_bundle_lighting_index \
  --test root_archetypal_field_seed \
  --test graph_test_harness \
  -- \
  --test-threads=1
