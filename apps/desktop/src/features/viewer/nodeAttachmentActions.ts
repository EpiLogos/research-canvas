import type {
  AttachNodeAttachmentResult,
  ContentOrigin,
  GraphContentCasMutation,
  GraphNode,
  LocalNodeDocument,
  NodeAttachment,
} from "@research-canvas/desktop-api";

interface AttachmentTransport {
  readGraphNode(input: { graphNodeId: string }): Promise<GraphNode>;
  attachNodeAttachment(input: {
    databasePath?: string;
    workspaceRoot: string;
    graphNodeId: string;
    sourceAbsolutePath: string;
    kind: "image" | "file";
    role: "inline" | "cover" | "file";
    caption?: string;
    authoritativeDocument: {
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
 * local document first, then projects that exact document through the normal
 * graph-content CAS ownership contract. A remote outage leaves explicit
 * pending local work rather than an untracked asset or a frozen reader.
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
}): Promise<AttachedNodeMedia> {
  if (!input.databasePath) {
    throw new Error("Media attachments require the active workspace database.");
  }
  if (!input.workspaceRoot) {
    throw new Error("Media attachments require the active workspace root.");
  }

  const graphNode = await input.transport.readGraphNode({ graphNodeId: input.graphNodeId });
  const remoteBaseline = graphBaseline(graphNode);
  const attached = await input.transport.attachNodeAttachment({
    databasePath: input.databasePath,
    workspaceRoot: input.workspaceRoot,
    graphNodeId: input.graphNodeId,
    sourceAbsolutePath: input.sourceAbsolutePath,
    kind: input.kind,
    role: input.role,
    caption: input.caption ?? "",
    authoritativeDocument: {
      body: graphNode.body,
      summary: graphNode.summary,
      contentOrigin: remoteBaseline.origin,
      contentRevision: remoteBaseline.revision,
      bodySourceCoordinates: graphNode.bodySourceCoordinates,
      entityType: graphNode.entityType,
      title: graphNode.title,
      schemaVersion: graphNode.seedSchemaVersion ?? 1,
    },
  });

  const localGraph = graphWithLocalDocument(graphNode, attached.document);
  // Cover selection is durable presentation data, not a document edit. A
  // local cover attach therefore must not send an equal content revision
  // through CAS: Neo4j correctly rejects that as a stale/no-op write.
  if (documentMatchesGraphNode(attached.document, graphNode)) {
    return { attachment: attached.attachment, graphNode: localGraph, remoteSynced: true };
  }
  let mutation: GraphContentCasMutation;
  try {
    mutation = await input.transport.compareAndSwapGraphNodeContent({
      graphNodeId: input.graphNodeId,
      expectedRemoteRevision: remoteBaseline.legacy ? null : attached.expectedRemoteRevision,
      expectedRemoteOrigin: remoteBaseline.legacy ? null : attached.expectedRemoteOrigin,
      allowLegacyNull: remoteBaseline.legacy,
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
    await input.transport.acknowledgeLocalNodeDocumentSync({
      databasePath: input.databasePath,
      graphNodeId: input.graphNodeId,
      expectedRevision: attached.document.contentRevision,
      expectedOrigin: attached.document.contentOrigin,
    });
  } catch {
    // The attachment/document remains durable and pending; the reader still
    // receives the authoritative new local body below.
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

function graphWithLocalDocument(graphNode: GraphNode, document: LocalNodeDocument): GraphNode {
  return {
    ...graphNode,
    body: document.body,
    summary: document.summary,
    contentOrigin: document.contentOrigin,
    contentRevision: document.contentRevision,
    bodySourceCoordinates: document.bodySourceCoordinates,
  };
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
