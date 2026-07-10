import { entityTypeForNodeType } from "@research-canvas/canvas";
import type { NewGraphNodeInput } from "@research-canvas/desktop-api";
import { markGraphNodeSyncPending } from "./pendingGraphNodeSync";

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
    contentOrigin: "user_authored",
    contentRevision: 0,
    bodySourceCoordinates: [],
  };
}

/**
 * Local-first note creation side effects, factored out of
 * `CanvasWorkspaceContext.createNoteNode` so they're independently testable
 * (the context itself pulls in Tauri/Zustand bootstrapping that's too heavy
 * to render in a unit test).
 *
 * Order matters: the local node document is seeded FIRST and awaited, so the
 * note is guaranteed editable (openable in the document viewer) the instant
 * creation returns — even fully offline. The Neo4j substance sync is
 * best-effort and fire-and-forget; on failure the node is recorded as
 * "pending sync" (see `pendingGraphNodeSync.ts`) so a later retry pass can
 * pick it up once Neo4j is reachable again.
 */
export async function seedNoteNodeEffects(args: {
  graphNodeId: string;
  title: string;
  databasePath: string | null;
  upsertLocalNodeDocument: (input: {
    databasePath: string;
    graphNodeId: string;
    body: string;
    summary: string;
    contentOrigin: "user_authored";
    contentRevision: number;
    bodySourceCoordinates: string[];
    metadataProjection: { entityType: "Work"; title: string; schemaVersion: number };
  }) => Promise<unknown>;
  createGraphNode: (
    input: NewGraphNodeInput & { graphNodeId: string }
  ) => Promise<unknown>;
}): Promise<void> {
  const { graphNodeId, title, databasePath, upsertLocalNodeDocument, createGraphNode } = args;

  if (!databasePath) {
    throw new Error("note creation requires the authoritative local document store");
  }
  await upsertLocalNodeDocument({
    databasePath,
    graphNodeId,
    body: "",
    summary: "",
    contentOrigin: "user_authored",
    contentRevision: 0,
    bodySourceCoordinates: [],
    metadataProjection: { entityType: "Work", title, schemaVersion: 1 },
  });

  const input = {
    ...buildNewGraphNodeInput({ nodeType: "note", title }),
    graphNodeId,
  };
  try {
    await createGraphNode(input);
  } catch (error) {
    markGraphNodeSyncPending(input);
    console.warn("createGraphNode sync failed; node kept locally", error);
  }
}
