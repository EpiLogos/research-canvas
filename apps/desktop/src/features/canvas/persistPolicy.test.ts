import { describe, expect, it } from "vitest";
import { shouldWriteSubstanceOnLayoutFlush } from "./persistPolicy";

describe("shouldWriteSubstanceOnLayoutFlush", () => {
  /**
   * Invariant: after WS4a Task 6 cutover, the legacy persistProjectDocument
   * substance double-write (nodes + edges) is retired. Node substance is owned
   * by Neo4j (createGraphNode / updateGraphNode). This flag must remain false
   * permanently.
   *
   * This function is wired directly into the persist effect and selectProject in
   * CanvasWorkspaceContext.tsx — the nodes/edges arrays passed to
   * persistProjectDocument are gated on this return value
   * (`writeSubstance ? serialized.nodes : []`). If this reverts to true, both
   * callers will write substance rows again, AND this test will fail red,
   * surfacing the regression immediately.
   */
  it("returns false — node/edge substance is not written on layout flush", () => {
    expect(shouldWriteSubstanceOnLayoutFlush()).toBe(false);
  });
});
