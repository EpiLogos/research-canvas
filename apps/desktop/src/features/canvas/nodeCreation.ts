import { entityTypeForNodeType } from "@research-canvas/canvas";
import type { LocalNodeDocumentWriteResult, NewGraphNodeInput, SyncAcknowledgementMutation } from "@research-canvas/desktop-api";
import { clearGraphNodeSyncPending, markGraphNodeSyncPending } from "./pendingGraphNodeSync";

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
interface NoteAuthorityArgs {
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
  }) => Promise<LocalNodeDocumentWriteResult>;
}

interface NoteRemoteArgs {
  graphNodeId: string;
  title: string;
  databasePath: string | null;
  createGraphNode: (
    input: NewGraphNodeInput & { graphNodeId: string }
  ) => Promise<unknown>;
  acknowledgeLocalNodeDocumentSync: (input: {
    databasePath: string; graphNodeId: string; expectedRevision: number; expectedOrigin: "user_authored";
  }) => Promise<SyncAcknowledgementMutation>;
}

export async function prepareNoteNodeAuthority(args: NoteAuthorityArgs): Promise<void> {
  const { graphNodeId, title, databasePath, upsertLocalNodeDocument } = args;

  if (!databasePath) {
    throw new Error("note creation requires the authoritative local document store");
  }
  const result = await upsertLocalNodeDocument({
    databasePath,
    graphNodeId,
    body: "",
    summary: "",
    contentOrigin: "user_authored",
    contentRevision: 0,
    bodySourceCoordinates: [],
    metadataProjection: { entityType: "Work", title, schemaVersion: 1 },
  });
  if (result.mutation.kind !== "created") {
    const detail = result.mutation.kind === "conflict" ? `: ${result.mutation.reason}` : "";
    throw new Error(`new note local authority was not created (${result.mutation.kind})${detail}`);
  }
  if (!result.document || result.document.graphNodeId !== graphNodeId
      || result.document.body !== "" || result.document.summary !== ""
      || result.document.neo4jSynced !== false
      || result.document.contentOrigin !== "user_authored" || result.document.contentRevision !== 0
      || result.document.bodySourceCoordinates.length !== 0) {
    throw new Error("new note local authority returned an incoherent document");
  }
}

export type NoteRemoteSyncOutcome = "synced" | "pending";

function initialNoteGraphInput(graphNodeId: string, title: string) {
  return {
    ...buildNewGraphNodeInput({ nodeType: "note" as const, title }),
    graphNodeId,
    body: "",
  };
}

export async function syncNoteNodeRemote(args: NoteRemoteArgs): Promise<NoteRemoteSyncOutcome> {
  const { graphNodeId, title, databasePath, createGraphNode, acknowledgeLocalNodeDocumentSync } = args;
  if (!databasePath) {
    throw new Error("remote note sync requires the authoritative local document store");
  }
  const input = initialNoteGraphInput(graphNodeId, title);
  try {
    await createGraphNode(input);
  } catch (error) {
    markGraphNodeSyncPending(input, databasePath, false);
    console.warn("createGraphNode sync failed; node kept locally", error);
    return "pending";
  }
  try {
    const acknowledgement = await acknowledgeLocalNodeDocumentSync({
      databasePath, graphNodeId, expectedRevision: 0, expectedOrigin: "user_authored",
    });
    if (["updated", "preserved"].includes(acknowledgement.kind)) {
      clearGraphNodeSyncPending(graphNodeId);
      return "synced";
    }
    markGraphNodeSyncPending(input, databasePath, true);
    console.warn("initial note sync acknowledgement rejected; node kept pending", acknowledgement);
    return "pending";
  } catch (error) {
    markGraphNodeSyncPending(input, databasePath, true);
    console.warn("initial note sync acknowledgement failed; node kept pending", error);
    return "pending";
  }
}

/** Testable sequential composition; production canvas publication uses
 * `createPreparedNoteNode` so remote latency never gates visibility. */
export async function seedNoteNodeEffects(args: NoteAuthorityArgs & NoteRemoteArgs): Promise<void> {
  await prepareNoteNodeAuthority(args);
  await syncNoteNodeRemote(args);
}

export async function createPreparedNoteNode(args: NoteAuthorityArgs & NoteRemoteArgs & {
  publishCanvasNode: () => void;
}): Promise<void> {
  await prepareNoteNodeAuthority(args);
  args.publishCanvasNode();
  void syncNoteNodeRemote(args).catch((error) => {
    if (args.databasePath) {
      markGraphNodeSyncPending(initialNoteGraphInput(args.graphNodeId, args.title), args.databasePath, false);
    }
    console.warn("unexpected remote note sync failure; node kept locally", error);
  });
}
