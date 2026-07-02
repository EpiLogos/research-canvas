import { apiCall } from "../client.js";
import {
  buildBatchPlaceBody,
  buildPlaceNodeBody,
  buildUpdateLayoutBody,
  type PlaceNodeInput,
  type UpdateLayoutInput,
} from "./payloads.js";

export const canvasTools = [
  {
    name: "canvas_get_state",
    description:
      "List graph nodes on the active canvas with their layout (graphNodeId, entityType, title, position, style) and edges. Read-only. Call this first to see what already exists before placing.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [] as string[],
    },
    async handler(_input: Record<string, never>) {
      return apiCall("GET", "/api/canvas");
    },
  },
  {
    name: "canvas_place_node",
    description:
      "Place an existing graph node (by graphNodeId) on the active canvas at (x, y). Creates/updates its layout row only; does NOT create theory. Use after the Graphiti MCP has authored the node.",
    inputSchema: {
      type: "object" as const,
      properties: {
        graphNodeId: { type: "string", description: "Neo4j node id to place" },
        x: { type: "number" },
        y: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
        dotColour: { type: "string" },
        bgColour: { type: "string" },
        textColour: { type: "string" },
        thumbnail: { type: "string" },
      },
      required: ["graphNodeId", "x", "y"] as string[],
    },
    async handler(input: PlaceNodeInput) {
      return apiCall("PUT", "/api/layout/node", buildPlaceNodeBody(input));
    },
  },
  {
    name: "canvas_update_layout",
    description:
      "Update an existing node's position, size, or style on the active canvas. Layout only; theory is untouched.",
    inputSchema: {
      type: "object" as const,
      properties: {
        graphNodeId: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
        dotColour: { type: "string" },
        bgColour: { type: "string" },
        textColour: { type: "string" },
        thumbnail: { type: "string" },
      },
      required: ["graphNodeId"] as string[],
    },
    async handler(input: UpdateLayoutInput) {
      return apiCall("PUT", "/api/layout/node", buildUpdateLayoutBody(input));
    },
  },
  {
    name: "canvas_remove_node",
    description:
      "Remove a node's placement from the active canvas. The graph node (theory) is NOT deleted.",
    inputSchema: {
      type: "object" as const,
      properties: {
        graphNodeId: { type: "string" },
      },
      required: ["graphNodeId"] as string[],
    },
    async handler(input: { graphNodeId: string }) {
      return apiCall(
        "DELETE",
        `/api/layout/node/${encodeURIComponent(input.graphNodeId)}`,
      );
    },
  },
  {
    name: "canvas_batch_place",
    description:
      "Place multiple existing graph nodes (by graphNodeId) on the active canvas in one call. Layout only.",
    inputSchema: {
      type: "object" as const,
      properties: {
        placements: {
          type: "array",
          items: {
            type: "object",
            properties: {
              graphNodeId: { type: "string" },
              x: { type: "number" },
              y: { type: "number" },
              width: { type: "number" },
              height: { type: "number" },
            },
            required: ["graphNodeId", "x", "y"],
          },
        },
      },
      required: ["placements"] as string[],
    },
    async handler(input: {
      placements: Array<{
        graphNodeId: string;
        x: number;
        y: number;
        width?: number;
        height?: number;
      }>;
    }) {
      return apiCall("POST", "/api/layout/batch", buildBatchPlaceBody(input));
    },
  },
];
