import type {
  GraphNode,
  GraphContentCasInput,
  GraphContentCasMutation,
  GraphRelationship,
  LocalNodeDocument,
  LocalNodeDocumentInput,
  LocalNodeDocumentWriteResult,
  NewGraphNodeInput,
  SyncAcknowledgementMutation,
} from "@research-canvas/desktop-api";

import { markdownToBlockNoteJson } from "@research-canvas/exporter";

import { appendBlocksToBody, fileLinkBlock, imageBlock, paragraphsToBlocks } from "./contentBlocks";
import { isRelationshipKind, type RelationshipKind } from "./relationshipKinds";

export interface ContentLinkingDeps {
  databasePath: string;
  readGraphNode: (input: { graphNodeId: string }) => Promise<GraphNode>;
  readLocalNodeDocument: (input: { databasePath: string; graphNodeId: string }) => Promise<LocalNodeDocument | null>;
  upsertLocalNodeDocument: (input: LocalNodeDocumentInput) => Promise<LocalNodeDocumentWriteResult>;
  compareAndSwapGraphNodeContent: (input: GraphContentCasInput) => Promise<GraphContentCasMutation>;
  acknowledgeLocalNodeDocumentSync: (input: {
    databasePath: string; graphNodeId: string; expectedRevision: number; expectedOrigin: "user_authored";
  }) => Promise<SyncAcknowledgementMutation>;
  connectGraphNodes: (input: {
    sourceGraphNodeId: string;
    targetGraphNodeId: string;
    relType: string;
    properties?: Record<string, unknown>;
  }) => Promise<GraphRelationship>;
  createGraphNode: (input: NewGraphNodeInput) => Promise<GraphNode>;
  importNodeImage: (input: { graphNodeId: string; sourceAbsolutePath: string }) => Promise<string>;
}

export interface ContentLinkingActions {
  addTextToNode: (graphNodeId: string, text: string) => Promise<GraphNode>;
  addImageToNode: (
    graphNodeId: string,
    sourceAbsolutePath: string,
    caption?: string,
  ) => Promise<GraphNode>;
  attachFileToNode: (
    graphNodeId: string,
    sourceAbsolutePath: string,
    fileName: string,
  ) => Promise<GraphNode>;
  linkMarkdownFileToNode: (input: {
    graphNodeId: string;
    fileName: string;
    markdown: string;
  }) => Promise<GraphNode>;
  linkNodes: (input: {
    sourceGraphNodeId: string;
    targetGraphNodeId: string;
    kind: RelationshipKind;
    properties?: Record<string, unknown>;
  }) => Promise<GraphRelationship>;
}

export function createContentLinkingActions(deps: ContentLinkingDeps): ContentLinkingActions {
  const readContent = async (graphNodeId: string): Promise<{ node: GraphNode; local: LocalNodeDocument }> => {
    if (!deps.databasePath) {
      throw new Error("content linking requires the authoritative local document store");
    }
    const [node, local] = await Promise.all([
      deps.readGraphNode({ graphNodeId }),
      deps.readLocalNodeDocument({ databasePath: deps.databasePath, graphNodeId }),
    ]);
    if (!local) {
      throw new Error("content linking requires an existing local document");
    }
    if (node.contentRevision == null || node.contentOrigin == null) {
      throw new Error("content linking requires an explicit remote ownership and revision baseline");
    }
    if (local.contentRevision !== node.contentRevision || local.contentOrigin !== node.contentOrigin) {
      throw new Error("local and remote content baselines differ; reconcile before inserting content");
    }
    if (local.body !== node.body || local.summary !== node.summary
        || JSON.stringify(local.bodySourceCoordinates) !== JSON.stringify(node.bodySourceCoordinates)) {
      throw new Error("local and remote content projections differ at the same baseline");
    }
    return { node, local };
  };
  const writeBody = async (node: GraphNode, local: LocalNodeDocument, body: string): Promise<GraphNode> => {
    const nextRevision = local.contentRevision + 1;
    const localWrite = await deps.upsertLocalNodeDocument({
      databasePath: deps.databasePath, graphNodeId: node.graphNodeId, body, summary: local.summary,
      neo4jSynced: false, contentOrigin: "user_authored", contentRevision: nextRevision,
      expectedRevision: local.contentRevision, bodySourceCoordinates: local.bodySourceCoordinates,
    });
    if (localWrite.mutation.kind !== "updated") {
      throw new Error(localWrite.mutation.kind === "conflict"
        ? localWrite.mutation.reason
        : `local content write returned ${localWrite.mutation.kind}`);
    }
    const result = await deps.compareAndSwapGraphNodeContent({
      graphNodeId: node.graphNodeId,
      expectedRemoteRevision: node.contentRevision,
      expectedRemoteOrigin: node.contentOrigin,
      body,
      summary: local.summary,
      contentOrigin: "user_authored",
      contentRevision: nextRevision,
      bodySourceCoordinates: local.bodySourceCoordinates,
    });
    if (result.kind !== "updated") {
      throw new Error(result.kind === "conflict" ? result.reason : `content node ${result.kind}`);
    }
    const acknowledgement = await deps.acknowledgeLocalNodeDocumentSync({
      databasePath: deps.databasePath, graphNodeId: node.graphNodeId,
      expectedRevision: nextRevision, expectedOrigin: "user_authored",
    });
    if (!["updated", "preserved"].includes(acknowledgement.kind)) {
      throw new Error(acknowledgement.kind === "conflict" ? acknowledgement.reason : `content acknowledgement ${acknowledgement.kind}`);
    }
    return deps.readGraphNode({ graphNodeId: node.graphNodeId });
  };
  return {
    async addTextToNode(graphNodeId, text) {
      const { node, local } = await readContent(graphNodeId);
      const blocks = paragraphsToBlocks(text);
      if (blocks.length === 0) {
        return node;
      }
      const body = appendBlocksToBody(local.body, blocks);
      return writeBody(node, local, body);
    },

    async addImageToNode(graphNodeId, sourceAbsolutePath, caption = "") {
      const url = await deps.importNodeImage({ graphNodeId, sourceAbsolutePath });
      const { node, local } = await readContent(graphNodeId);
      const body = appendBlocksToBody(local.body, [imageBlock(url, caption)]);
      return writeBody(node, local, body);
    },

    async attachFileToNode(graphNodeId, sourceAbsolutePath, fileName) {
      // Reuses the same importNodeImage transport call as addImageToNode —
      // the underlying Rust command (import_node_image) is a generic byte
      // copy into assets/<graphNodeId>/<file>, not image-specific — so no
      // new backend command is needed to support arbitrary file attachments.
      const url = await deps.importNodeImage({ graphNodeId, sourceAbsolutePath });
      const { node, local } = await readContent(graphNodeId);
      const body = appendBlocksToBody(local.body, [fileLinkBlock(url, fileName)]);
      return writeBody(node, local, body);
    },

    async linkMarkdownFileToNode({ graphNodeId, fileName, markdown }) {
      const source = await deps.createGraphNode({
        entityType: "Source",
        title: fileName,
        body: markdownToBlockNoteJson(markdown),
        isTemporal: false,
        sourceCoordinates: [],
      });
      await deps.connectGraphNodes({
        sourceGraphNodeId: graphNodeId,
        targetGraphNodeId: source.graphNodeId,
        relType: "SOURCED_FROM",
      });
      const { node, local } = await readContent(graphNodeId);
      const body = appendBlocksToBody(local.body, [
        { type: "paragraph", content: [{ type: "text", text: `Linked source: ${fileName}` }] },
      ]);
      return writeBody(node, local, body);
    },

    async linkNodes({ sourceGraphNodeId, targetGraphNodeId, kind, properties }) {
      if (!isRelationshipKind(kind)) {
        throw new Error(`unknown relationship kind: ${String(kind)}`);
      }
      return deps.connectGraphNodes({
        sourceGraphNodeId,
        targetGraphNodeId,
        // map the typed `kind` to the transport's `relType` field (WS0 §5.2 / WS2);
        // RelationshipKind values are the Neo4j SCREAMING_SNAKE rel-type names verbatim.
        relType: kind,
        ...(properties === undefined ? {} : { properties }),
      });
    },
  };
}
