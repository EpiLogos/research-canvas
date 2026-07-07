import type {
  GraphNode,
  GraphNodePatch,
  GraphRelationship,
  NewGraphNodeInput,
} from "@research-canvas/desktop-api";

import { markdownToBlockNoteJson } from "@research-canvas/exporter";

import { appendBlocksToBody, fileLinkBlock, imageBlock, paragraphsToBlocks } from "./contentBlocks";
import { isRelationshipKind, type RelationshipKind } from "./relationshipKinds";

export interface ContentLinkingDeps {
  readGraphNode: (input: { graphNodeId: string }) => Promise<GraphNode>;
  updateGraphNode: (input: { graphNodeId: string; patch: GraphNodePatch }) => Promise<GraphNode>;
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
  return {
    async addTextToNode(graphNodeId, text) {
      const node = await deps.readGraphNode({ graphNodeId });
      const blocks = paragraphsToBlocks(text);
      if (blocks.length === 0) {
        return node;
      }
      const body = appendBlocksToBody(node.body, blocks);
      return deps.updateGraphNode({ graphNodeId, patch: { body } });
    },

    async addImageToNode(graphNodeId, sourceAbsolutePath, caption = "") {
      const url = await deps.importNodeImage({ graphNodeId, sourceAbsolutePath });
      const node = await deps.readGraphNode({ graphNodeId });
      const body = appendBlocksToBody(node.body, [imageBlock(url, caption)]);
      return deps.updateGraphNode({ graphNodeId, patch: { body } });
    },

    async attachFileToNode(graphNodeId, sourceAbsolutePath, fileName) {
      // Reuses the same importNodeImage transport call as addImageToNode —
      // the underlying Rust command (import_node_image) is a generic byte
      // copy into assets/<graphNodeId>/<file>, not image-specific — so no
      // new backend command is needed to support arbitrary file attachments.
      const url = await deps.importNodeImage({ graphNodeId, sourceAbsolutePath });
      const node = await deps.readGraphNode({ graphNodeId });
      const body = appendBlocksToBody(node.body, [fileLinkBlock(url, fileName)]);
      return deps.updateGraphNode({ graphNodeId, patch: { body } });
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
      const node = await deps.readGraphNode({ graphNodeId });
      const body = appendBlocksToBody(node.body, [
        { type: "paragraph", content: [{ type: "text", text: `Linked source: ${fileName}` }] },
      ]);
      return deps.updateGraphNode({ graphNodeId, patch: { body } });
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
