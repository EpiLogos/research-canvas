---
name: build-movement
description: Build a canvas representation of one episode movement from its spec markdown. Read the movement, plan the nodes, call canvas_batch_create to materialise it.
---

# Build Movement Skill

Use this skill when asked to "build movement N" from an episode spec file.

## Procedure

### 1. Read the movement spec

Use the Read tool to open the episode file (e.g. `episodes/ep-0.1/Episode_0_1_The_Naked_Face_v7.md`).

Find the target movement by its heading: `## MOVEMENT N:`. Extract all content until the next `##` heading.

### 2. Parse into node types

Map the movement content to nodes as follows:

| Source in markdown | Node type | Default dotColour |
|---|---|---|
| `## MOVEMENT N: TITLE` | `group` | `#e67e22` (amber) |
| `### Subsection heading` | `note` | `#4a4aff` (blue) |
| `- Bullet point` under a subsection | `note` | `#4a4aff` (blue) |
| `> Blockquote` (reading / quote) | `note` (purple) | `#9b59b6` |
| `### READ — "Title"` | `note` | `#9b59b6` |
| Image file referenced in content | `resource` | `#27ae60` (green) |

### 3. Plan positions (left-to-right flow)

Use this layout grid. All coordinates in canvas units (pixels).

- **Movement group node**: `x=0, y=0` — always index 0 in the batch
- **Subsection anchor nodes**: `x = 320 * subsectionIndex, y = 120`
- **Bullet children** of a subsection: `x = subsectionAnchor.x, y = 120 + (bulletIndex + 1) * 180`
- **Reading / quote nodes**: `x = subsectionAnchor.x, y = subsectionAnchor.y - 200` (above the anchor)

Keep X spacing at 320px between subsections, Y spacing at 180px between children.

### 4. Build the batch payload

Construct the `canvas_batch_create` call:

- `nodes[0]` is always the movement group node (`nodeType: "group"`, `color: "#e67e22"`)
- Subsection nodes follow
- Bullet/reading nodes follow their parent subsection
- Edges:
  - Group → each subsection anchor: `{ sourceIndex: 0, targetIndex: subsectionIdx, label: "contains" }`
  - Subsection → its bullets: `{ sourceIndex: subsectionIdx, targetIndex: bulletIdx, label: "detail" }`
  - Reading → its parent subsection: `{ sourceIndex: readingIdx, targetIndex: subsectionIdx, label: "source", style: "dashed" }`

### 5. Call canvas_batch_create

Call the tool once with the complete payload. Do not call canvas_create_node in a loop — use the batch.

### 6. Verify

Call `canvas_get_state` and confirm: `"Movement N built: X nodes, Y edges."`

Report: node count, edge count, list of subsection titles created.

## Example invocation

> "Build movement 2 from episodes/ep-0.1/Episode_0_1_The_Naked_Face_v7.md"

1. Read the file, extract Movement 2 content
2. Parse: 1 group node, N subsection anchors, M bullet notes, K reading quotes
3. Build positions
4. Call `canvas_batch_create` with all nodes + edges in one shot
5. Report result

## Node colour reference

| Role | Colour |
|---|---|
| Movement group | `#e67e22` |
| Concept / subsection | `#4a4aff` |
| Bullet detail | `#4a4aff` |
| Quote / reading | `#9b59b6` |
| Resource / image | `#27ae60` |
