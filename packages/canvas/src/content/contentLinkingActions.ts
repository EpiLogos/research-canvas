import type {
  GraphNode,
  GraphNodePatch,
  GraphRelationship,
  NewGraphNodeInput,
} from "@research-canvas/desktop-api";

import { markdownToBlockNoteJson } from "@research-canvas/exporter";

import { appendBlocksToBody, imageBlock, paragraphsToBlocks } from "./contentBlocks";

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
  linkMarkdownFileToNode: (input: {
    graphNodeId: string;
    fileName: string;
    markdown: string;
  }) => Promise<GraphNode>;
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
  };
}
