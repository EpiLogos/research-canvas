import { apiCall } from "../client.js";

export const batchTools = [
  {
    name: "canvas_batch_create",
    description:
      "Create many nodes and edges in a single call. Use this when building a full movement — it is much faster than individual calls. Nodes are created in order; edges reference them by index in the nodes array (0-based), so you do not need to know IDs upfront. Returns the created IDs mapped to their indices.",
    inputSchema: {
      type: "object" as const,
      properties: {
        nodes: {
          type: "array",
          description: "Ordered list of nodes to create",
          items: {
            type: "object",
            properties: {
              nodeType: {
                type: "string",
                enum: ["note", "group"],
                description: '"note" or "group"',
              },
              title: { type: "string" },
              content: {
                type: "string",
                description: "Text body (note only)",
              },
              x: { type: "number" },
              y: { type: "number" },
              dotColour: { type: "string" },
              bgColour: { type: "string" },
              textColour: { type: "string" },
              color: {
                type: "string",
                description: "Group accent colour (group only)",
              },
            },
            required: ["nodeType", "title", "x", "y"],
          },
        },
        edges: {
          type: "array",
          description:
            "Edges referencing nodes by their index in the nodes array above",
          items: {
            type: "object",
            properties: {
              sourceIndex: {
                type: "number",
                description: "Index of source node in the nodes array",
              },
              targetIndex: {
                type: "number",
                description: "Index of target node in the nodes array",
              },
              label: { type: "string" },
              directed: { type: "boolean" },
              style: {
                type: "string",
                enum: ["solid", "dashed", "dotted"],
              },
            },
            required: ["sourceIndex", "targetIndex"],
          },
        },
      },
      required: ["nodes", "edges"],
    },
    async handler(input: {
      nodes: Array<{
        nodeType: string;
        title: string;
        content?: string;
        x: number;
        y: number;
        dotColour?: string;
        bgColour?: string;
        textColour?: string;
        color?: string;
      }>;
      edges: Array<{
        sourceIndex: number;
        targetIndex: number;
        label?: string;
        directed?: boolean;
        style?: string;
      }>;
    }) {
      return apiCall("POST", "/api/batch", {
        nodes: input.nodes.map((n) => ({
          node_type: n.nodeType,
          title: n.title,
          content: n.content,
          x: n.x,
          y: n.y,
          dot_colour: n.dotColour,
          bg_colour: n.bgColour,
          text_colour: n.textColour,
          color: n.color,
        })),
        edges: input.edges.map((e) => ({
          source_index: e.sourceIndex,
          target_index: e.targetIndex,
          label: e.label,
          directed: e.directed,
          style: e.style,
        })),
      });
    },
  },
];
