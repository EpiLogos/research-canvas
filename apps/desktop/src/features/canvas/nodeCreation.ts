import { entityTypeForNodeType } from "@research-canvas/canvas";
import type { NewGraphNodeInput } from "@research-canvas/desktop-api";

/**
 * Build a `NewGraphNodeInput` for a canvas node type.
 * The returned object is suitable for passing to `transport.createGraphNode`.
 * A pre-minted `graphNodeId` is NOT included here — callers attach it via
 * the intersection cast pattern documented in the WS4a brief.
 */
export function buildNewGraphNodeInput(args: {
  nodeType: "note" | "group" | "resource";
  title: string;
}): NewGraphNodeInput {
  return {
    entityType: entityTypeForNodeType(args.nodeType),
    title: args.title,
    body: "[]",
    isTemporal: false,
    sourceCoordinates: [],
  };
}
