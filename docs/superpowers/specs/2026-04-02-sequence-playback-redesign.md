# Sequence Playback Redesign — Graph-Emergent Branching Sequences

**Date:** 2026-04-02
**Status:** Design approved

## Overview

Replace the current sidebar-based sequence system (SequenceStore, SequencePanel, SequenceEditor, SequencePlayer) with a graph-emergent model where sequences arise naturally from edges marked as "sequencing arrows" on the canvas. Playback becomes a full-screen cinematic presenter suitable for screen recordings, with branching narrative paths and keyboard-driven navigation.

## Core Principles

1. **The graph is the sequence.** No separate Sequence/SequenceStep entities. Edges marked `sequencing: true` define the path. Nodes are the steps.
2. **Topology defines structure.** Roots are auto-detected (nodes with outgoing sequencing edges but no incoming). Branches are nodes with multiple sequencing exits.
3. **Playback is ephemeral.** The graph is persisted; playback position is not. You persist the story structure, not where someone paused.
4. **Adaptive presentation.** Each content type gets the full-screen layout that suits it best.

## Data Model Changes

### Edge: Two New Fields

```typescript
// Added to CanvasEdge
sequencing: boolean        // default false — marks edge as part of sequence path
sequencePriority: number   // default 0 — controls exit ordering at branch points (lower = first)
```

The edge's existing `label` field serves as the exit label shown during playback (e.g., "causes...", "alternatively..."). The existing `relationKind` provides semantic context. No duplication needed.

### Node: Two New Optional Fields

```typescript
// Added to CanvasNode (all variants)
sequenceCaption: string | null   // override text shown in presenter side panel; falls back to node.summary
sequenceViewport: Viewport | null // optional viewport snap; if null, auto-frames the node
```

The node IS the step. No separate step entity.

### Removed Entities

- `Sequence` type, schema, and SQLite table
- `SequenceStep` type, schema, and SQLite table
- `SequenceStore` (Zustand store)
- `SequencePanel`, `SequenceEditor`, `SequencePlayer` components
- "Sequences" tab from the right panel

### Schema Migration

- Add `sequencing BOOLEAN NOT NULL DEFAULT 0` and `sequence_priority INTEGER NOT NULL DEFAULT 0` to `canvas_edges`
- Add `sequence_caption TEXT` and `sequence_viewport_json TEXT` to `canvas_nodes`
- Drop `sequences` and `sequence_steps` tables
- Update `CanvasEdge` and `CanvasNode` Zod schemas in `packages/schema/`

## Graph Walker — `walkSequenceGraph()`

A pure function that computes the sequence topology from raw nodes and edges.

**Input:** All canvas nodes + all canvas edges

**Output:**
```typescript
interface SequenceGraph {
  roots: string[]                          // nodeIds with outgoing sequencing edges, no incoming
  adjacency: Map<string, SequenceExit[]>   // nodeId → sorted exits
  nodeSet: Set<string>                     // all nodes participating in the sequence
  hasCycles: boolean                       // safety flag
  terminalNodes: string[]                  // nodes with incoming sequencing edges, no outgoing
}

interface SequenceExit {
  edgeId: string
  targetNodeId: string
  label: string         // from edge.label
  priority: number      // from edge.sequencePriority
}
```

**Behavior:**
- Filters edges to `sequencing === true`
- Builds adjacency map; sorts exits by `sequencePriority` then by `label` alphabetically as tiebreaker
- Detects roots: nodes in the edge set with outgoing but no incoming sequencing edges
- Detects terminals: nodes with incoming but no outgoing sequencing edges
- Cycle detection via DFS — sets `hasCycles: true` but does not prevent playback (cycles are valid for looping narratives; playback tracks visited path to prevent infinite loops)

**Memoization:** Recomputed only when edges or their `sequencing`/`sequencePriority` fields change. Stored as derived state via `useMemo` or a Zustand selector.

## Playback Engine

### State Model

```typescript
interface PlaybackState {
  active: boolean
  path: string[]           // stack of visited nodeIds
  currentNodeId: string    // top of stack
}

type PlaybackAction =
  | { type: 'enter'; rootNodeId: string }
  | { type: 'advance'; exitIndex: number }
  | { type: 'back' }
  | { type: 'jump'; nodeId: string; pathFromRoot: string[] }
  | { type: 'home' }
  | { type: 'exit' }
```

Implemented as a `useReducer` inside the presenter component. Purely ephemeral — not persisted, not in any store.

### Navigation

| Action | Behavior |
|--------|----------|
| **Enter** | Push root onto path. If multiple roots, show root picker first. |
| **Advance** | Look up exits for `currentNodeId` from `SequenceGraph.adjacency`. Push `exits[exitIndex].targetNodeId` onto path. If target already in path (cycle), show a subtle "revisiting" indicator on that exit label but still allow the advance if the user explicitly presses the key — prevents accidental infinite loops while permitting intentional revisits. |
| **Back** | Pop current node from path. Previous node becomes current. If path empty, show root picker or exit. |
| **Jump** | Replace path with provided `pathFromRoot` (computed by sequence map on click). |
| **Home** | Clear path, return to root picker. |
| **Exit** | Set `active: false`, return to canvas. |

### Keyboard Controls

| Key | Action |
|-----|--------|
| `1`–`9` | Advance to exit by position |
| `Space` | Advance if exactly one exit (fast linear playback) |
| `Backspace` | Go back one step |
| `Home` | Return to root picker |
| `Escape` | Exit playback entirely |

### Viewport Transitions

When advancing to a node:
1. If `node.sequenceViewport` exists → animate to that exact viewport (500ms ease-out)
2. Otherwise → auto-frame: compute viewport that centers the node with comfortable padding, animate to it (500ms ease-out)

## Full-Screen Presenter

Replaces `FullScreenReader`. A modal overlay that takes over the entire window.

### Adaptive Layouts

**Image nodes (resource type: image):**
- Image fills ~70% width as hero (object-fit: contain, dark background)
- Right side panel (~30%) with: title, caption (or summary fallback), "via: {edge label}" showing how you arrived
- Exits docked at bottom of side panel as numbered buttons

**Markdown / text nodes (resource type: markdown, text):**
- Centered reading column (~600px max-width) with comfortable typography
- Title above content, caption below
- Exits at bottom center
- No side panel — text is the content

**PDF nodes (resource type: pdf):**
- PDF viewer takes ~75% width
- Thin right side panel with title + caption + exits

**Note nodes:**
- Same as markdown — centered column layout
- Note content rendered as the main body

### Universal Elements

**Breadcrumb trail (top bar):**
- Shows path taken: `Root → Node A → Node B → Current`
- Each crumb clickable — jumps back to that point (pops stack to that node)
- Subtle, semi-transparent, doesn't compete with content

**Exit bar (bottom):**
- Numbered labels from outgoing sequencing edges, ordered by priority
- Format: `[1] causes... [2] alternatively... [3] but consider...`
- If single exit: `Space to continue →` prompt
- If no exits (terminal): `End of sequence · Backspace to go back · Esc to exit`
- Keyboard hint numbers match the `1-9` key bindings

**Root picker (entry point):**
- If multiple roots exist, shows a simple centered list of root node titles
- Click or press `1-9` to pick
- If single root, skips directly to it

**Transitions:**
- Crossfade between steps (200ms)
- Canvas viewport animates underneath during transition

### Entry and Exit

- **Enter playback:** Right-click canvas background → "Play sequence" menu item (only visible if sequencing edges exist). Keyboard shortcut: `P`
- **Exit playback:** `Escape` key. Returns to canvas at the viewport of the last viewed step.

## Sequence Map Overlay

Replaces the React Flow `<MiniMap>` component. An SVG overlay showing the sequence topology as a focused flowchart.

### Display

- Shows only nodes participating in the sequence (those in `SequenceGraph.nodeSet`)
- Rendered as a small directed graph: circles/pills for nodes, arrows for sequencing edges
- Current node highlighted (filled/glowing)
- Visited nodes dimmed or checked
- Unvisited nodes outlined
- Branch points visually distinct (slightly larger, or a fork icon)
- Terminal nodes marked (dot or square endpoint marker)

### Positioning

- Docked to bottom-left of the canvas (same position as the old minimap)
- Same hover-to-reveal behavior as the current minimap (opacity 0 → 1 on canvas hover)
- During full-screen playback: always visible, docked to a corner of the presenter

### Interaction

- Click a node in the sequence map → during playback, jumps to that node (computes shortest path from nearest root)
- During normal canvas editing: click a sequence map node → flies the canvas to that node
- Hovering a node in the map highlights it on the canvas (and vice versa)

### Layout Algorithm

- Auto-layout using a simple top-down tree layout (roots at top, branches spread horizontally)
- No manual positioning — computed from the `SequenceGraph` adjacency structure
- Compact: sized to fit in the minimap area (~200x150px default)

## Context Menu Integration

### Edge Context Menu (existing, extended)

Add to the edge right-click menu:
- **"Mark as sequence arrow"** — sets `sequencing: true` on the edge. Toggles to "Remove from sequence" if already sequencing.
- **"Set sequence priority"** — small number input or submenu with Low/Medium/High presets (maps to 0/50/100). Only visible on sequencing edges.

### Node Context Menu (existing, extended)

Add to the node right-click menu:
- **"Set sequence caption..."** — prompt to set/edit the `sequenceCaption` override. Only visible if the node participates in a sequence.
- **"Set sequence viewport"** — captures current viewport as `sequenceViewport` for this node. Only visible if the node participates in a sequence.

### Canvas Context Menu (existing, extended)

Add:
- **"Play sequence"** — enters full-screen playback. Only visible if sequencing edges exist on the canvas.

## Visual Treatment of Sequencing Edges

Edges with `sequencing: true` get a distinct visual treatment on the canvas:

- **Color:** A warm accent color distinct from regular edges (e.g., gold/amber `#f0b45a` matching the app's accent palette)
- **Style:** Animated dashed stroke (CSS `stroke-dashoffset` animation) — conveys directionality and flow
- **Arrow marker:** Always shows a forward arrow regardless of the edge's `directionality` setting — the sequencing direction is always source → target
- **Label:** Edge label remains visible and serves dual purpose (semantic label + playback exit label)
- **Z-order:** Rendered above regular edges so the sequence path is always legible

Regular edge styling is unaffected. The sequencing visual is additive — it layers on top of whatever stroke/color/dash the edge already has.

## Right Panel Changes

- Remove the "Sequences" tab entirely from `RightPanelSlot`
- Three remaining tabs: Inspector, Content, Terminal
- Sequence caption and viewport editing happen through the node context menu and inspector fields (add "Sequence" section to InspectorTab when the selected node is in the sequence)

## Inspector Integration

When a node participating in the sequence is selected, the InspectorTab shows an additional "Sequence" section:

- **Caption:** Editable text field for `sequenceCaption`
- **Viewport:** "Capture current" button + "Clear" button for `sequenceViewport`
- **Exits:** Read-only list of outgoing sequencing edges with their labels and priorities

When a sequencing edge is selected, the InspectorTab shows:

- **Sequencing:** Toggle switch (same as context menu)
- **Priority:** Number input for `sequencePriority`
- **Exit label:** The edge's `label` field (already editable in inspector)

## Testing Strategy

### Unit Tests

- `walkSequenceGraph()` — roots detection, adjacency building, cycle detection, priority sorting, empty graph, single-node graph, disconnected sequences
- Playback reducer — all action types, boundary conditions (back from root, advance past terminal, cycle handling)
- Schema validation — new fields on CanvasEdge and CanvasNode

### Integration Tests

- Rust repository — new edge/node fields persist and load correctly
- Canvas store — sequencing flag toggles, priority updates, cascade behavior when edges deleted
- Workspace context — sequence graph recomputed on edge changes, presenter receives correct data

### E2E Tests

- Mark edge as sequencing via context menu → visual treatment appears
- Enter playback → correct root shown → advance through branches → back navigation works
- Full-screen presenter renders correct layout per content type
- Sequence map shows correct topology and highlights current node
- Keyboard controls work throughout playback
