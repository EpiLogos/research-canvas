import { describe, expect, it } from "vitest";
import { shouldWriteSubstanceOnLayoutFlush } from "./persistPolicy";

describe("shouldWriteSubstanceOnLayoutFlush", () => {
  /**
   * Invariant: after WS4a Task 6 cutover, the legacy persistProjectDocument
   * substance double-write (nodes + edges) is retired. Node substance is owned
   * by Neo4j (createGraphNode / updateGraphNode). This flag must remain false
   * permanently — if it ever reverts to true, this test surfaces the regression.
   */
  it("returns false — node/edge substance is not written on layout flush", () => {
    expect(shouldWriteSubstanceOnLayoutFlush()).toBe(false);
  });
});
