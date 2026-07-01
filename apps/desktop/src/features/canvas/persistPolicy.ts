/**
 * WS4a Task 6 cutover invariant.
 *
 * Node and edge substance is owned by Neo4j (createGraphNode / updateGraphNode).
 * The legacy persistProjectDocument substance double-write (nodes + edges) is
 * permanently retired after the WS4a cutover. This helper encodes that decision
 * as a compile-time-stable constant so that a future re-introduction of the
 * double-write fails the test in persistPolicy.test.ts.
 *
 * Annotations continue to flow through the legacy persistProjectDocument path
 * (annotations live in canvas_annotations, which has NO foreign-key dependency
 * on canvas_nodes — confirmed in migrations/0001_initial.sql). Passing
 * nodes: [] and edges: [] alongside annotations clears the legacy substance
 * rows (harmless; that abandoned data is exactly what the cutover drops) while
 * re-inserting annotations safely.
 */
export function shouldWriteSubstanceOnLayoutFlush(): boolean {
  return false;
}
