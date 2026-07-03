/**
 * legacyNodeImport.ts
 *
 * One-time import of legacy `canvas_nodes` (SQLite) rows into the layout
 * store (`node_layout`), so nothing is stranded now that `load_canvas_view`
 * is layout-authoritative (lf-task-4). A node created before the cutover
 * lives only in the legacy `canvas_nodes` table; `loadCanvasView` never sees
 * it because it iterates layout rows, not legacy nodes. On workspace load we
 * diff `document.nodes` (legacy) against the layout-authoritative view and
 * write a layout row (+ sidecar) for anything missing, then best-effort sync
 * the substance to Neo4j via `createGraphNode`.
 *
 * Idempotent by construction: a legacy node whose id already has a layout
 * row (i.e. already appears in `view.nodes`) is never re-imported.
 */

import { nodeLayoutFromCanvasNode } from "@research-canvas/desktop-api";
import type { CanvasView, NewGraphNodeInput, NodeLayout } from "@research-canvas/desktop-api";
import { entityTypeForNodeType, paragraphsToBlocks } from "@research-canvas/canvas";
import type { CanvasNode } from "@research-canvas/schema";

/**
 * The Neo4j `body` field is a JSON-serialized array of BlockNote blocks
 * (see `packages/canvas/src/content/contentBlocks.ts`), never raw text.
 * A legacy note's plain-text `content` is converted through the same
 * `paragraphsToBlocks` helper the live content-linking path uses, so a
 * synced legacy note round-trips through the document viewer correctly.
 * Non-note types (resource/group/portal) carry no body text — `"[]"`
 * matches the empty body used at fresh-node creation (nodeCreation.ts).
 */
function bodyForLegacyNode(node: CanvasNode): string {
  if (node.type !== "note" || !node.content) {
    return "[]";
  }
  return JSON.stringify(paragraphsToBlocks(node.content));
}

/**
 * Pure selection: which legacy nodes have no corresponding layout row yet
 * (i.e. are absent from the layout-authoritative `loadCanvasView` result).
 * Selecting by id makes this trivially idempotent — call it again after an
 * import and it returns an empty array.
 */
export function selectLegacyNodesNeedingImport(
  legacyNodes: CanvasNode[],
  view: CanvasView
): CanvasNode[] {
  const existingIds = new Set(view.nodes.map((joined) => joined.node.graphNodeId));
  return legacyNodes.filter((node) => !existingIds.has(node.id));
}

export interface ImportLegacyCanvasNodesInput {
  legacyNodes: CanvasNode[];
  view: CanvasView;
  databasePath: string;
  upsertNodeLayout: (input: { databasePath?: string; layout: NodeLayout }) => Promise<void>;
  createGraphNode: (
    input: NewGraphNodeInput & { graphNodeId: string }
  ) => Promise<unknown>;
}

/**
 * Import every legacy node not yet represented in the layout store.
 *
 * Safe by construction:
 *  - Never throws: each node's layout write and graph sync are isolated by
 *    try/catch so one failure never blocks the rest, or the caller.
 *  - Never syncs substance for a node whose local layout write failed (that
 *    would risk a Neo4j node with no local layout row to join it back to —
 *    the opposite of what we're trying to fix).
 */
export async function importLegacyCanvasNodes(
  input: ImportLegacyCanvasNodesInput
): Promise<void> {
  const { legacyNodes, view, databasePath, upsertNodeLayout, createGraphNode } = input;
  const toImport = selectLegacyNodesNeedingImport(legacyNodes, view);

  for (const node of toImport) {
    try {
      const layout = nodeLayoutFromCanvasNode(node);
      await upsertNodeLayout({ databasePath, layout });
    } catch (error) {
      console.warn("legacy node import: upsertNodeLayout failed; skipping node", node.id, error);
      continue;
    }

    try {
      const entityType = entityTypeForNodeType(node.type);
      await createGraphNode({
        entityType,
        title: node.title,
        body: bodyForLegacyNode(node),
        isTemporal: false,
        sourceCoordinates: [],
        graphNodeId: node.id,
      });
    } catch (error) {
      console.warn("legacy node import: createGraphNode sync failed; node kept locally", node.id, error);
    }
  }
}
