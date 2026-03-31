---
name: canvas-api
description: Quick reference for all canvas MCP tools. Use when you need to look up an exact field name or understand what a tool returns.
---

# Canvas API Reference

All tools communicate with the Research Canvas app over `http://127.0.0.1:9876`. The app must be running and a canvas must be open.

## Tools

### canvas_get_state
Returns the full active canvas.
```json
{ "canvas_id": "uuid", "nodes": [...], "edges": [...] }
```
Node fields: `id, canvas_id, node_type, title, content, x, y, dot_colour, bg_colour, text_colour, thumbnail, summary, resource_kind, absolute_path`
Edge fields: `id, canvas_id, source_id, target_id, label, relation_kind, directionality`

### canvas_create_node
Required: `nodeType` ("note" | "group" | "resource"), `title`, `x`, `y`
Optional: `content`, `dotColour`, `bgColour`, `textColour`, `color` (group), `absolutePath`, `relativePath`, `resourceKind`
Returns: created node object.

### canvas_update_node
Required: `id`
Optional: `title`, `content`, `x`, `y`, `dotColour`, `bgColour`, `textColour`, `thumbnail`
Returns: `{ "ok": true }`

### canvas_delete_node
Required: `id`
Also deletes all connected edges.
Returns: `{ "ok": true }`

### canvas_create_edge
Required: `sourceId`, `targetId`
Optional: `label` (also used as relation_kind, default "reference"), `directed` (bool, default true), `style` ("solid" | "dashed" | "dotted")
Returns: created edge object.

### canvas_delete_edge
Required: `id`
Returns: `{ "ok": true }`

### canvas_batch_create
Required: `nodes` (array), `edges` (array — reference nodes by `sourceIndex`/`targetIndex`)
Returns: `{ "nodes": [{ "index": N, "id": "uuid" }...], "edges": [...] }`

## Node colours (convention)
| Role | Hex |
|---|---|
| Movement group | `#e67e22` |
| Concept / subsection | `#4a4aff` |
| Quote / reading | `#9b59b6` |
| Resource / image | `#27ae60` |

## Error format
```json
{ "ok": false, "error": "message" }
```
If you get "Canvas app is not running", start the app and open a canvas.
If you get "No active canvas", click on a canvas in the app.
