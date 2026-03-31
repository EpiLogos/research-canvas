# Claude Canvas Plugin — Design Spec
**Date:** 2026-03-31
**Status:** Approved for implementation planning

---

## Problem Statement

The Research Canvas app needs Claude Code to be able to build and manage canvas content directly from the terminal tab. The primary use case: given an episode markdown file structured into numbered movements, Claude should parse the movements and materialise them as canvas nodes, edges, and groups — while the user watches the canvas populate in real time.

---

## 1. Architecture Overview

```
Claude Code (terminal tab)
    │
    │  MCP tool calls
    ▼
MCP Server (.claude/mcp-servers/research-canvas/)
    │
    │  HTTP POST/GET  http://127.0.0.1:9876/api/
    ▼
Tauri Rust Backend  (new api/ module)
    │               │
    │ SQLite repo    │ Tauri emit("canvas:updated")
    ▼               ▼
SQLite DB       React Frontend
                    │
                    ▼
                Canvas re-renders live
```

The MCP server is a Node.js/TypeScript process registered in `.claude/settings.json`. It starts automatically when Claude Code initialises in this project. Each tool call hits the local HTTP API, which writes to SQLite via the existing repository layer and then emits a Tauri event to the frontend — so nodes appear on the canvas as Claude creates them.

---

## 2. Repository Layout

### New files

```
.claude/
  settings.json                          # MCP server registration
  mcp-servers/
    research-canvas/
      package.json                       # { "name": "research-canvas-mcp", "type": "module" }
      tsconfig.json
      src/
        index.ts                         # MCP server entry point, tool registration
        client.ts                        # HTTP client — fetch wrapper for the Tauri API
        tools/
          canvas.ts                      # get_canvas, create_node, update_node, delete_node
          edges.ts                       # create_edge, delete_edge
          batch.ts                       # batch_create (nodes + edges in one call)
  skills/
    build-movement.md                    # Main skill: parse movement spec → canvas nodes
    canvas-api.md                        # Reference: all tool signatures + node types

apps/desktop/src-tauri/src/
  api/
    mod.rs                               # Axum HTTP server, starts on 127.0.0.1:9876
    canvas_routes.rs                     # Node/edge CRUD handlers
    types.rs                             # Request/response structs (serde)
  main.rs                                # (modified) starts API server in background thread

apps/desktop/src/
  features/canvas/CanvasWorkspaceContext.tsx  # (modified) listen for canvas:updated event
```

### Modified files

- `apps/desktop/src-tauri/src/main.rs` — spawn API server thread before `tauri::Builder`
- `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx` — add Tauri event listener for `canvas:updated` to re-fetch canvas data

---

## 3. Tauri HTTP API

Server: `127.0.0.1:9876`. Bound to localhost only — never exposed externally.

### Endpoints

| Method | Path | Body | Description |
|---|---|---|---|
| `GET` | `/api/canvas` | — | Returns current active canvas (nodes + edges) |
| `POST` | `/api/nodes` | `CreateNodeRequest` | Create a node, return created node with id |
| `PATCH` | `/api/nodes/:id` | `UpdateNodeRequest` | Update title, position, style fields |
| `DELETE` | `/api/nodes/:id` | — | Delete node + its attached edges |
| `POST` | `/api/edges` | `CreateEdgeRequest` | Create edge between two nodes |
| `DELETE` | `/api/edges/:id` | — | Delete edge |
| `POST` | `/api/batch` | `BatchCreateRequest` | Create many nodes + edges atomically |

All responses: `{ ok: true, data: ... }` or `{ ok: false, error: "message" }`.

### Request types

```rust
// CreateNodeRequest — canvas_id resolved server-side from active canvas state
{
  "node_type": "note" | "resource" | "group" | "portal",
  "title": "string",
  "content": "string",      // optional — for note nodes
  "x": f64,
  "y": f64,
  "dot_colour": "string",   // optional hex colour
  "bg_colour": "string",    // optional
  "text_colour": "string"   // optional
}

// UpdateNodeRequest — all fields optional
{
  "title": "string",
  "content": "string",
  "x": f64,
  "y": f64,
  "dot_colour": "string",
  "bg_colour": "string",
  "text_colour": "string"
}

// CreateEdgeRequest — canvas_id resolved server-side
{
  "source_node_id": "uuid",
  "target_node_id": "uuid",
  "label": "string",        // optional
  "directed": bool,         // default true
  "style": "solid" | "dashed" | "dotted"  // default "solid"
}

// BatchCreateRequest — canvas_id resolved server-side
{
  "nodes": [ CreateNodeRequest... ],
  "edges": [                           // references nodes by index in the nodes array
    { "source_index": 0, "target_index": 1, "label": "...", ... }
  ]
}
```

After each write operation, the handler calls:
```rust
app_handle.emit("canvas:updated", canvas_id)
```

### Frontend listener

In `CanvasWorkspaceContext.tsx`, add:
```ts
useEffect(() => {
  const unlisten = await listen("canvas:updated", () => {
    refreshCanvas(); // re-fetch nodes + edges from store
  });
  return () => unlisten();
}, []);
```

---

## 4. MCP Server

**Language:** TypeScript (Node.js), uses the `@modelcontextprotocol/sdk` package.

**Entry point:** `.claude/mcp-servers/research-canvas/src/index.ts`

### Tools exposed to Claude

#### `canvas_get_state`
Returns the full canvas: all nodes with id, type, title, content, position, style; all edges with id, source, target, label.

```
Input: none
Output: { canvasId, nodes: Node[], edges: Edge[] }
```

#### `canvas_create_node`
The canvas_id is read from the app's active canvas state server-side — callers do not need to pass it.
```
Input: {
  nodeType: "note" | "resource" | "group" | "portal"
  title: string
  content?: string
  x: number
  y: number
  dotColour?: string   // hex e.g. "#4a4aff"
  bgColour?: string
  textColour?: string
}
Output: { id: string, ...node }
```

#### `canvas_update_node`
```
Input: { id: string, title?: string, content?: string, x?: number, y?: number, dotColour?: string, bgColour?: string, textColour?: string }
Output: { ok: true }
```

#### `canvas_delete_node`
```
Input: { id: string }
Output: { ok: true }
```

#### `canvas_create_edge`
```
Input: { sourceId: string, targetId: string, label?: string, directed?: boolean, style?: "solid"|"dashed"|"dotted" }
Output: { id: string }
```

#### `canvas_delete_edge`
```
Input: { id: string }
Output: { ok: true }
```

#### `canvas_batch_create`
Create a full movement in one call. Canvas id is resolved server-side from the active canvas. Nodes are specified in order; edges reference nodes by their index in the batch array, so IDs don't need to be known upfront.
```
Input: {
  nodes: Array<{ nodeType, title, content?, x, y, dotColour?, bgColour?, textColour? }>
  edges: Array<{ sourceIndex: number, targetIndex: number, label?: string, directed?: boolean, style?: string }>
}
Output: { nodes: [{ index, id }...], edges: [{ id }...] }
```

### HTTP client (`client.ts`)

Single `apiCall(method, path, body?)` function. Base URL `http://127.0.0.1:9876`. On connection refused, returns a helpful error: `"Canvas app is not running. Start the app first."`.

---

## 5. Skills

### `.claude/skills/build-movement.md` — The main skill

This skill teaches Claude how to turn one movement from an episode spec into a canvas.

**Procedure:**

1. **Locate the movement.** Read the episode markdown. Find the movement by `## MOVEMENT N:` heading. Extract everything until the next `##` heading.

2. **Parse into node types:**
   - `## MOVEMENT N: TITLE` → one **group** node (amber `#e67e22`) — the movement container
   - `### Subsection heading` → one **note** node (blue `#4a4aff`) per subsection, as a concept anchor
   - `- Bullet point` under a subsection → one **note** node (blue `#4a4aff`) per bullet, child of subsection
   - `> Blockquote` (readings) → one **note** node (purple `#9b59b6`) per quote block, with full text as content
   - `### READ — "Title"` → one **resource** node (blue `#4a4aff`) — title is the reading name
   - Named image files referenced → one **resource** node per image

3. **Plan positions.** Left-to-right flow. Group node at `(0, 0)`. Subsections spaced `320px` apart on X. Children of a subsection offset `+200px` on Y. Reading nodes below their parent concept at `+280px` Y.

4. **Build the batch payload.** Use `canvas_batch_create` with all nodes and edges in one call. Edges: subsection → its bullet children (directed); group → subsection nodes (directed); reading nodes → their concept parent (dashed edge, label "source").

5. **Verify.** Call `canvas_get_state` and confirm the expected node count. Report: `"Movement N built: X nodes, Y edges."` with a brief summary.

**Node colour conventions:**
| Node | Colour |
|---|---|
| Movement group | `#e67e22` (amber) |
| Concept / subsection | `#4a4aff` (blue) |
| Bullet point note | `#4a4aff` (blue, lighter bg) |
| Reading / quote | `#9b59b6` (purple) |
| Resource / image | `#27ae60` (green) |

**Invocation:** `"Build movement 2 from episodes/ep-0.1/Episode_0_1_The_Naked_Face_v7.md"`

### `.claude/skills/canvas-api.md` — Reference

Compact reference listing all 7 tools, their input fields, and return shapes. No workflow instructions — just a lookup. Claude uses this when it needs to remember an exact field name or check what's available.

---

## 6. Configuration

### `.claude/settings.json`

```json
{
  "mcpServers": {
    "research-canvas": {
      "command": "npx",
      "args": ["tsx", ".claude/mcp-servers/research-canvas/src/index.ts"],
      "cwd": "${workspaceRoot}"
    }
  }
}
```

The MCP server starts when Claude Code initialises in this project directory. `tsx` runs TypeScript directly without a build step.

---

## 7. Dependencies

### MCP server (`package.json`)
```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0"
  },
  "devDependencies": {
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0"
  }
}
```

### Rust (`Cargo.toml` additions)
```toml
axum = { version = "0.7", features = ["json"] }
tokio = { version = "1", features = ["full"] }   # likely already present via Tauri
tower-http = { version = "0.5", features = ["cors"] }
```

---

## 8. What Is Out of Scope (v1)

- Switching active project or canvas via MCP (Claude works in the currently open canvas)
- Uploading or creating image files — resource nodes point to existing file paths
- Undoable operations — changes go directly to SQLite
- The MCP server running when the app is closed
- Publishing the plugin to the claude-plugins marketplace
