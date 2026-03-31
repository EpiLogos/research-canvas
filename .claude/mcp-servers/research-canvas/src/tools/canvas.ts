import { apiCall } from "../client.js";

export const canvasTools = [
  {
    name: "canvas_get_state",
    description:
      "Get the current canvas state: all nodes (id, type, title, content, position, style) and all edges. Call this first to understand what's already on the canvas.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
    async handler(_input: Record<string, never>) {
      return apiCall("GET", "/api/canvas");
    },
  },
  {
    name: "canvas_create_node",
    description:
      'Create a single node. nodeType: "note" (authored text), "group" (named container, amber), "resource" (file reference). For groups supply color (hex). For resources supply absolutePath and resourceKind.',
    inputSchema: {
      type: "object" as const,
      properties: {
        nodeType: {
          type: "string",
          enum: ["note", "group", "resource"],
          description: 'Node type: "note", "group", or "resource"',
        },
        title: { type: "string", description: "Node title (required)" },
        content: {
          type: "string",
          description: "Text content (note nodes only)",
        },
        x: { type: "number", description: "Canvas X position" },
        y: { type: "number", description: "Canvas Y position" },
        dotColour: {
          type: "string",
          description: "Hex colour for the node dot, e.g. #4a4aff",
        },
        bgColour: { type: "string", description: "Background hex colour" },
        textColour: { type: "string", description: "Text hex colour" },
        color: {
          type: "string",
          description: "Group node accent colour (group only)",
        },
        absolutePath: {
          type: "string",
          description: "Absolute file path (resource only)",
        },
        relativePath: {
          type: "string",
          description: "Relative file path (resource only)",
        },
        resourceKind: {
          type: "string",
          description:
            'Resource kind: "markdown", "image", "pdf", "text" (resource only)',
        },
      },
      required: ["nodeType", "title", "x", "y"],
    },
    async handler(input: {
      nodeType: string;
      title: string;
      content?: string;
      x: number;
      y: number;
      dotColour?: string;
      bgColour?: string;
      textColour?: string;
      color?: string;
      absolutePath?: string;
      relativePath?: string;
      resourceKind?: string;
    }) {
      return apiCall("POST", "/api/nodes", {
        node_type: input.nodeType,
        title: input.title,
        content: input.content,
        x: input.x,
        y: input.y,
        dot_colour: input.dotColour,
        bg_colour: input.bgColour,
        text_colour: input.textColour,
        color: input.color,
        absolute_path: input.absolutePath,
        relative_path: input.relativePath,
        resource_kind: input.resourceKind,
      });
    },
  },
  {
    name: "canvas_update_node",
    description:
      "Update a node's title, content, position, or style. Only provided fields are changed.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Node ID (from canvas_get_state)" },
        title: { type: "string" },
        content: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        dotColour: { type: "string" },
        bgColour: { type: "string" },
        textColour: { type: "string" },
        thumbnail: { type: "string" },
      },
      required: ["id"],
    },
    async handler(input: {
      id: string;
      title?: string;
      content?: string;
      x?: number;
      y?: number;
      dotColour?: string;
      bgColour?: string;
      textColour?: string;
      thumbnail?: string;
    }) {
      return apiCall("PATCH", `/api/nodes/${input.id}`, {
        title: input.title,
        content: input.content,
        x: input.x,
        y: input.y,
        dot_colour: input.dotColour,
        bg_colour: input.bgColour,
        text_colour: input.textColour,
        thumbnail: input.thumbnail,
      });
    },
  },
  {
    name: "canvas_delete_node",
    description: "Delete a node and all its connected edges.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Node ID to delete" },
      },
      required: ["id"],
    },
    async handler(input: { id: string }) {
      return apiCall("DELETE", `/api/nodes/${input.id}`);
    },
  },
];
