import { apiCall } from "../client.js";

export const edgeTools = [
  {
    name: "canvas_create_edge",
    description:
      "Draw a connection between two nodes. label is also the relation_kind stored in the DB (e.g. \"reference\", \"supports\", \"source\"). directed defaults to true (arrow). style: \"solid\", \"dashed\", or \"dotted\".",
    inputSchema: {
      type: "object" as const,
      properties: {
        sourceId: {
          type: "string",
          description: "Source node ID (from canvas_get_state or canvas_create_node)",
        },
        targetId: { type: "string", description: "Target node ID" },
        label: {
          type: "string",
          description: 'Relation label, e.g. "reference", "source", "supports"',
        },
        directed: {
          type: "boolean",
          description: "True for arrow (default), false for undirected line",
        },
        style: {
          type: "string",
          enum: ["solid", "dashed", "dotted"],
          description: "Line style (default: solid)",
        },
      },
      required: ["sourceId", "targetId"],
    },
    async handler(input: {
      sourceId: string;
      targetId: string;
      label?: string;
      directed?: boolean;
      style?: string;
    }) {
      return apiCall("POST", "/api/edges", {
        source_id: input.sourceId,
        target_id: input.targetId,
        label: input.label,
        directed: input.directed,
        style: input.style,
      });
    },
  },
  {
    name: "canvas_delete_edge",
    description: "Remove a connection between nodes.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Edge ID (from canvas_get_state)" },
      },
      required: ["id"],
    },
    async handler(input: { id: string }) {
      return apiCall("DELETE", `/api/edges/${input.id}`);
    },
  },
];
