import type {
  ContentOrigin,
  GraphContentCasInput,
  GraphContentCasMutation,
  GraphNode,
  LocalNodeDocument,
  NewGraphNodeInput,
  PendingNodeDocumentSync,
  SyncAcknowledgementMutation,
} from "@research-canvas/desktop-api";

interface PendingEntry {
  input: NewGraphNodeInput & { graphNodeId: string };
  databasePath: string;
  remoteCreated: boolean;
}

export interface PendingGraphNodeSyncDeps {
  createGraphNode(input: NewGraphNodeInput & { graphNodeId: string }): Promise<GraphNode>;
  findGraphNode(input: { graphNodeId: string }): Promise<GraphNode | null>;
  readLocalNodeDocument(input: { databasePath: string; graphNodeId: string }): Promise<LocalNodeDocument | null>;
  compareAndSwapGraphNodeContent(input: GraphContentCasInput): Promise<GraphContentCasMutation>;
  acknowledgeLocalNodeDocumentSync(input: {
    databasePath: string; graphNodeId: string; expectedRevision: number; expectedOrigin: ContentOrigin;
  }): Promise<SyncAcknowledgementMutation>;
}

const pending = new Map<string, PendingEntry>();
let retryInFlight: Promise<void> | null = null;
let rehydrateInFlight: Promise<void> | null = null;

export function markGraphNodeSyncPending(
  input: NewGraphNodeInput & { graphNodeId: string },
  databasePath: string,
  remoteCreated: boolean,
): void {
  const prior = pending.get(input.graphNodeId);
  pending.set(input.graphNodeId, {
    input,
    databasePath,
    remoteCreated: remoteCreated || prior?.remoteCreated === true,
  });
}

export function clearGraphNodeSyncPending(graphNodeId: string): void {
  pending.delete(graphNodeId);
}

export function isGraphNodeSyncPending(graphNodeId: string): boolean {
  return pending.has(graphNodeId);
}

export function pendingGraphNodeSyncCount(): number {
  return pending.size;
}

export function resetPendingGraphNodeSync(): void {
  pending.clear();
  retryInFlight = null;
  rehydrateInFlight = null;
}

function exact(remote: GraphNode, local: LocalNodeDocument): boolean {
  return remote.body === local.body
    && remote.summary === local.summary
    && remote.contentRevision === local.contentRevision
    && remote.contentOrigin === local.contentOrigin
    && JSON.stringify(remote.bodySourceCoordinates) === JSON.stringify(local.bodySourceCoordinates);
}

/** Mirrors the repository ownership planner for a strictly newer local
 * document. This is the only policy gate that may authorize a remote CAS
 * across content origins. */
export function canPromoteRemoteContent(
  remoteOrigin: ContentOrigin | null,
  remoteRevision: number | null,
  localOrigin: ContentOrigin,
  localRevision: number,
): boolean {
  if (remoteOrigin === null || remoteRevision === null || localRevision <= remoteRevision) {
    return false;
  }
  switch (localOrigin) {
    case "user_authored":
      return true;
    case "corpus_compiled":
      return remoteOrigin !== "user_authored";
    case "seed":
      return remoteOrigin === "seed";
    case "imported":
      return false;
  }
}

async function reconcileEntry(entry: PendingEntry, deps: PendingGraphNodeSyncDeps): Promise<void> {
  const graphNodeId = entry.input.graphNodeId;
  const local = await deps.readLocalNodeDocument({ databasePath: entry.databasePath, graphNodeId });
  if (!local) return;

  let remote = await deps.findGraphNode({ graphNodeId });
  if (!remote) {
    const createInput = {
      ...entry.input,
      body: local.body,
      summary: local.summary,
      contentOrigin: local.contentOrigin,
      contentRevision: local.contentRevision,
      bodySourceCoordinates: local.bodySourceCoordinates,
    };
    try {
      await deps.createGraphNode(createInput);
      entry.remoteCreated = true;
    } catch (error) {
      // A transport can fail after the CREATE committed. Re-read and accept
      // only exact evidence; unrelated read errors remain failures.
      remote = await deps.findGraphNode({ graphNodeId });
      if (!remote) throw error;
    }
    remote = remote ?? await deps.findGraphNode({ graphNodeId });
  }

  if (!remote) return;
  if (!exact(remote, local)) {
    const compatibleOlder = canPromoteRemoteContent(
      remote.contentOrigin,
      remote.contentRevision,
      local.contentOrigin,
      local.contentRevision,
    );
    if (!compatibleOlder) return;
    const mutation = await deps.compareAndSwapGraphNodeContent({
      graphNodeId,
      expectedRemoteRevision: remote.contentRevision,
      expectedRemoteOrigin: remote.contentOrigin,
      body: local.body,
      summary: local.summary,
      contentOrigin: local.contentOrigin,
      contentRevision: local.contentRevision,
      bodySourceCoordinates: local.bodySourceCoordinates,
    });
    if (mutation.kind !== "updated") return;
  }

  const acknowledgement = await deps.acknowledgeLocalNodeDocumentSync({
    databasePath: entry.databasePath,
    graphNodeId,
    expectedRevision: local.contentRevision,
    expectedOrigin: local.contentOrigin,
  });
  if (["updated", "preserved"].includes(acknowledgement.kind)) {
    pending.delete(graphNodeId);
  }
}

export function retryPendingGraphNodeSyncs(deps: PendingGraphNodeSyncDeps): Promise<void> {
  if (retryInFlight) return retryInFlight;
  retryInFlight = (async () => {
    for (const entry of Array.from(pending.values())) {
      try {
        await reconcileEntry(entry, deps);
      } catch (error) {
        console.warn("retryPendingGraphNodeSyncs: reconciliation failed; node kept pending", entry.input.graphNodeId, error);
      }
    }
  })().finally(() => {
    retryInFlight = null;
  });
  return retryInFlight;
}

export interface DurablePendingGraphNodeSyncDeps extends PendingGraphNodeSyncDeps {
  listPendingNodeDocumentSyncs(input: { databasePath: string }): Promise<PendingNodeDocumentSync[]>;
}

/** Rebuilds the in-memory retry index from SQLite after a process/module
 * restart, then enters the same single-flight reconciliation used at runtime.
 * Structural fields are taken verbatim from the durable projection; content
 * always comes from the latest authoritative local document read. */
export function rehydratePendingGraphNodeSyncs(
  databasePath: string,
  deps: DurablePendingGraphNodeSyncDeps,
): Promise<void> {
  if (rehydrateInFlight) return rehydrateInFlight;
  rehydrateInFlight = (async () => {
    const rows = await deps.listPendingNodeDocumentSyncs({ databasePath });
    for (const row of rows) {
      markGraphNodeSyncPending({
        ...row.structure,
        body: row.document.body,
        summary: row.document.summary,
        contentOrigin: row.document.contentOrigin,
        contentRevision: row.document.contentRevision,
        bodySourceCoordinates: row.document.bodySourceCoordinates,
      }, databasePath, false);
    }
    await retryPendingGraphNodeSyncs(deps);
  })().finally(() => {
    rehydrateInFlight = null;
  });
  return rehydrateInFlight;
}

export function startDurablePendingGraphNodeSyncRetryInterval(
  databasePath: string | null,
  deps: DurablePendingGraphNodeSyncDeps,
  intervalMs = 15_000,
): () => void {
  if (!databasePath) return () => {};
  const intervalId = setInterval(() => {
    void rehydratePendingGraphNodeSyncs(databasePath, deps).catch((error) => {
      console.warn("durable pending node sync interval failed; rows remain pending", error);
    });
  }, intervalMs);
  return () => clearInterval(intervalId);
}
