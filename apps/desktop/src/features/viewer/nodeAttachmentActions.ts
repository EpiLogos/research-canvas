import type {
  AttachNodeAttachmentResult,
  ContentOrigin,
  GraphContentCasMutation,
  GraphNode,
  LocalNodeDocument,
  NodeAttachment,
} from "@research-canvas/desktop-api";

interface AttachmentTransport {
  attachNodeAttachment(input: {
    databasePath?: string;
    workspaceRoot: string;
    graphNodeId: string;
    sourceAbsolutePath: string;
    kind: "image" | "file";
    role: "inline" | "cover" | "file";
    caption?: string;
    authoritativeDocument?: {
      body: string;
      summary: string;
      contentOrigin: ContentOrigin;
      contentRevision: number;
      bodySourceCoordinates: string[];
      entityType: GraphNode["entityType"];
      title: string;
      schemaVersion: number;
    };
  }): Promise<AttachNodeAttachmentResult>;
  compareAndSwapGraphNodeContent(input: {
    graphNodeId: string;
    expectedRemoteRevision: number | null;
    expectedRemoteOrigin: ContentOrigin | null;
    allowLegacyNull?: boolean;
    body: string;
    summary: string;
    contentOrigin: ContentOrigin;
    contentRevision: number;
    bodySourceCoordinates: string[];
  }): Promise<GraphContentCasMutation>;
  acknowledgeLocalNodeDocumentSync(input: {
    databasePath: string;
    graphNodeId: string;
    expectedRevision: number;
    expectedOrigin: ContentOrigin;
  }): Promise<{ kind: string }>;
}

export interface AttachedNodeMedia {
  attachment: NodeAttachment;
  graphNode: GraphNode;
  /** A false value means the durable local mutation is pending remote CAS. */
  remoteSynced: boolean;
}

/**
 * The one frontend mutation boundary for inline images, arbitrary files and
 * covers. It always asks the native service to attach bytes and update the
 * local document first, then makes an optional best-effort graph-content CAS
 * from a known baseline. A remote outage leaves explicit pending local work
 * rather than an untracked asset or a frozen reader.
 */
export async function attachNodeMedia(input: {
  transport: AttachmentTransport;
  databasePath: string | null;
  workspaceRoot: string | null;
  graphNodeId: string;
  sourceAbsolutePath: string;
  kind: "image" | "file";
  role: "inline" | "cover" | "file";
  caption?: string;
  /** The reader/canvas record already open in this surface, if any. */
  openGraphNode?: GraphNode | null;
}): Promise<AttachedNodeMedia> {
  if (!input.databasePath) {
    throw new Error("Media attachments require the active workspace database.");
  }
  if (!input.workspaceRoot) {
    throw new Error("Media attachments require the active workspace root.");
  }

  const openGraphNode = input.openGraphNode ?? null;
  const remoteBaseline = openGraphNode ? graphBaseline(openGraphNode) : null;
  const attached = await input.transport.attachNodeAttachment({
    databasePath: input.databasePath,
    workspaceRoot: input.workspaceRoot,
    graphNodeId: input.graphNodeId,
    sourceAbsolutePath: input.sourceAbsolutePath,
    kind: input.kind,
    role: input.role,
    caption: input.caption ?? "",
    ...(openGraphNode && remoteBaseline
      ? {
          authoritativeDocument: {
            body: openGraphNode.body,
            summary: openGraphNode.summary,
            contentOrigin: remoteBaseline.origin,
            contentRevision: remoteBaseline.revision,
            bodySourceCoordinates: openGraphNode.bodySourceCoordinates,
            entityType: openGraphNode.entityType,
            title: openGraphNode.title,
            schemaVersion: openGraphNode.seedSchemaVersion ?? 1,
          },
        }
      : {}),
  });

  const localGraph = attached.graphNode;
  // Cover selection is durable presentation data, never a request to sync
  // document content. In particular, the native service can return a pending
  // local document here (from an earlier prose/media edit); CASing it merely
  // because the user chose a cover would publish unrelated authored work.
  if (input.role === "cover") {
    return {
      attachment: attached.attachment,
      graphNode: localGraph,
      remoteSynced: attached.document.neo4jSynced,
    };
  }
  // Other idempotent attachment requests can preserve an already-synced
  // document. Avoid a rejected equal-revision CAS in that narrow case.
  if (openGraphNode && documentMatchesGraphNode(attached.document, openGraphNode)) {
    return { attachment: attached.attachment, graphNode: localGraph, remoteSynced: true };
  }
  // Native has already committed the asset, attachment, presentation and
  // document. A pending local projection does not contain a trustworthy
  // remote revision, so leave it durable and visible instead of attempting a
  // speculative CAS that could overwrite a different remote document.
  if (!attached.remoteSyncEligible) {
    return { attachment: attached.attachment, graphNode: localGraph, remoteSynced: false };
  }
  let mutation: GraphContentCasMutation;
  try {
    mutation = await input.transport.compareAndSwapGraphNodeContent({
      graphNodeId: input.graphNodeId,
      expectedRemoteRevision: remoteBaseline?.legacy ? null : attached.expectedRemoteRevision,
      expectedRemoteOrigin: remoteBaseline?.legacy ? null : attached.expectedRemoteOrigin,
      allowLegacyNull: remoteBaseline?.legacy ?? false,
      body: attached.document.body,
      summary: attached.document.summary,
      contentOrigin: attached.document.contentOrigin,
      contentRevision: attached.document.contentRevision,
      bodySourceCoordinates: attached.document.bodySourceCoordinates,
    });
  } catch {
    return { attachment: attached.attachment, graphNode: localGraph, remoteSynced: false };
  }

  if (mutation.kind !== "updated") {
    return { attachment: attached.attachment, graphNode: localGraph, remoteSynced: false };
  }

  try {
    const acknowledgement = await input.transport.acknowledgeLocalNodeDocumentSync({
      databasePath: input.databasePath,
      graphNodeId: input.graphNodeId,
      expectedRevision: attached.document.contentRevision,
      expectedOrigin: attached.document.contentOrigin,
    });
    if (acknowledgement.kind !== "updated" && acknowledgement.kind !== "preserved") {
      return { attachment: attached.attachment, graphNode: localGraph, remoteSynced: false };
    }
  } catch {
    // The attachment/document remains durable and pending; the reader still
    // receives the authoritative new local body below.
    return { attachment: attached.attachment, graphNode: localGraph, remoteSynced: false };
  }
  return { attachment: attached.attachment, graphNode: localGraph, remoteSynced: true };
}

function graphBaseline(graphNode: GraphNode): { origin: ContentOrigin; revision: number; legacy: boolean } {
  if (graphNode.contentOrigin != null && graphNode.contentRevision != null) {
    return {
      origin: graphNode.contentOrigin,
      revision: graphNode.contentRevision,
      legacy: false,
    };
  }
  return { origin: "user_authored", revision: 0, legacy: true };
}

function documentMatchesGraphNode(document: LocalNodeDocument, graphNode: GraphNode): boolean {
  return document.body === graphNode.body
    && document.summary === graphNode.summary
    && document.contentOrigin === graphNode.contentOrigin
    && document.contentRevision === graphNode.contentRevision
    && document.bodySourceCoordinates.length === graphNode.bodySourceCoordinates.length
    && document.bodySourceCoordinates.every(
      (coordinate, index) => coordinate === graphNode.bodySourceCoordinates[index],
    );
}
