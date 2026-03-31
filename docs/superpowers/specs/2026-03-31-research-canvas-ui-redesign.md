# Research Canvas — UI Redesign Spec
**Date:** 2026-03-31
**Status:** Approved for implementation planning

---

## Problem Statement

The existing Codex-built UI has fundamental UX failures: canvas is a tiny centred square, sidebars dominate with oversized buttons and descriptions, terminal is a single squished line, no proper CRUD for nodes, arrow drawing is missing, no image functionality, markdown reader broken, resource adding is buried, panels are not responsive, project nesting is overly complex, and there is no terminal persistence. This spec replaces all shell layout, node UX, and interaction patterns.

---

## 1. Shell Layout

### Principle
Canvas is the product. Everything else is subordinate and on-demand.

### Structure

```
┌────────────────────────────────────────────────────────┐
│ titlebar (26px, macOS traffic lights + ⌘K button)      │
├──┬─────────────────────────────────────────────────────┤
│  │                                                      │
│  │              CANVAS (React Flow, infinite)           │
│  │                                                      │
│i │   ← overlay left panel (slides over canvas)         │
│c │                    right panel → (slides over canvas)│
│o │                                                      │
│n │                                                      │
│  │                                                      │
├──┴─────────────────────────────────────────────────────┤
│ status bar (20px)  nodes · edges · zoom · ⌘T hint      │
└────────────────────────────────────────────────────────┘
```

### Icon Strip (always visible, 26px)
- Fixed left edge, never hidden
- Icons (top to bottom): Files/Project, Search, Sequences, Annotations
- Bottom: Settings
- Clicking an icon toggles the left overlay panel open/closed to that view
- Active icon highlighted, no labels — tooltips only

### Left Overlay Panel
- Slides in over the canvas (does not shrink canvas)
- Default width ~240px, drag handle on right edge to resize, snaps closed below 120px
- Contains whichever view the active icon selects:
  - **Files/Project**: project selector at top (name + canvas switcher), then resource roots list (folders added from anywhere on machine), then file tree of those roots
  - **Search**: fuzzy search across all indexed content
  - **Sequences**: sequence list + step editor
  - **Annotations**: annotation layer controls
- No persistent topbar/header — the icon strip is the only chrome

### Right Panel (slot — switchable)
- Slides in over the canvas from the right
- Default width ~320px, drag handle on left edge to resize
- Has three tabs across the top: **Inspector · Content · Terminal**
- Only appears when triggered: node selection opens Inspector, ⌘T or clicking Terminal tab opens Terminal, node double-click switches to Content
- Inspector and Content tabs: deselecting a node does not close the panel, but the Inspector goes to an empty/idle state. The panel itself only closes when explicitly dismissed (X button or ⌘B / ⌘T toggle).
- Terminal tab: never auto-closes. Once opened, the panel stays until the user explicitly closes it.
- **Inspector tab**: node metadata, colour/style controls, connected nodes, edge labels
- **Content tab**: renders the node's attached file — markdown, image, PDF, plain text
- **Terminal tab**: full PTY terminal, persistent session (shell does not die on panel close — process stays alive), reopening restores the live session

### Canvas
- React Flow, infinite, no bounding box
- Background: subtle dot grid, very low opacity
- No top navigation bar, no header titles on the canvas
- Minimap: small corner overlay (toggle with ⌘M)

### Status Bar (20px, bottom)
- Left: active project name · canvas name
- Centre: node count · edge count
- Right: zoom level · `⌘T terminal` · `⌘K search`
- No bold text, no icons — plain monospace-style labels

### Keyboard Shortcuts
| Action | Shortcut |
|---|---|
| Command palette | ⌘K |
| Toggle terminal | ⌘T |
| Toggle left panel | ⌘B |
| Open node content (right panel) | double-click node |
| Full-screen reader | double-click node again (Content tab already open) or ⌘↵ |
| Exit full-screen | Esc |
| New note node | N (canvas focused) |
| Add resource node | R (canvas focused) |
| Delete selected | ⌫ / Delete |
| Draw edge mode | Shift+drag from node |
| Minimap | ⌘M |

---

## 2. Project & Workspace Structure

### Model
```
Workspace (the app itself, one SQLite DB)
└── Project (named, e.g. "Antichrist Research")
    ├── Resource Roots: ["/Users/x/Documents/research", "/Volumes/archive/media"]
    ├── Canvas A ("Power Structures")
    │   └── nodes, edges, annotations, sequences
    └── Canvas B ("Timeline")
        └── nodes, edges, annotations, sequences
```

- A **Project** is a named container with:
  - One or more **resource roots** — arbitrary folder paths from anywhere on the local machine, added via native folder picker (no nesting, flat list)
  - One or more **canvases** — each canvas is independent, has its own spatial graph
- No project nesting. Projects are flat. Canvases inside a project can reference the same resource roots.
- Creating a project: click `+` in Files panel → name it → immediately prompted to add at least one resource root folder
- Switching projects: dropdown at top of Files panel
- Switching canvases: tab strip below the project name in Files panel

### File/Project Access from Left Panel
The Files panel is a square overlay — not a persistent sidebar. It is accessed only when needed (toggling the Files icon). Inside a project/canvas, files are available at node-creation time without the panel being open (via right-click → fuzzy search).

---

## 3. Node System

### Node Types
| Type | Purpose | Dot Colour Default |
|---|---|---|
| `resource` | Attached file (md, pdf, image, txt, folder) | Blue `#4a4aff` |
| `note` | Inline text authored in-app | Purple `#9b59b6` |
| `group` | Named container grouping other nodes | Amber `#e67e22` |
| `portal` | Link to another canvas within the project | Teal `#1abc9c` |

### Adaptive Appearance (zoom-driven)
- **Zoomed out** (< 0.4 zoom): dot only (12px circle, node colour)
- **Mid zoom** (0.4–0.8): pill — dot + label text, compact border-radius rect
- **Zoomed in** (> 0.8): small card — dot, type label, title, filename/meta line
- At card zoom: if a thumbnail is set, it renders as a small image header on the card
- Transitions are animated (CSS transition, 150ms ease)

### Node Customisation (Inspector tab)
All per-node, persisted to SQLite:
- **Dot colour**: preset palette (8 colours) + custom hex picker
- **Background colour**: preset palette (dark variants) + custom hex picker — applies to pill/card background
- **Text colour**: preset palette + custom — applies to label/title
- **Thumbnail/icon**: set an image file (from resource roots) or a single emoji/icon character shown on the card face

### Node Interactions
- **Single click**: selects node, opens right panel to **Inspector tab**
- **Double-click**: opens right panel to **Content tab** (renders the attached file); if right panel is already open to Content, double-click enters full-screen reader mode (canvas hidden, Esc to return)
- **Right-click**: context menu (see §5)
- **Drag**: move node, smooth spring animation (react-spring or framer-motion), other nodes do not shuffle
- **Multi-select**: shift-click or drag-select box

### Node CRUD
- **Create**: right-click canvas → context menu → choose type (or N/R shortcuts)
- **Edit title**: double-click the label text on the node itself (inline edit)
- **Edit content**: Content tab in right panel; for notes, inline editable textarea
- **Delete**: select + Delete key, or right-click → Delete (confirms if node has edges)
- **Duplicate**: ⌘D or right-click → Duplicate

---

## 4. Edge Drawing

Three equivalent entry points — all create the same edge:

1. **Hover handles** (primary): hover a node → small circular handles appear at cardinal points (top, bottom, left, right) → drag from handle → ghost line follows cursor → release on target node → edge created
2. **Shift+drag** (power): hold Shift, drag from anywhere on a node body
3. **Right-click → Draw edge**: cursor changes to crosshair, click source then target

### Edge Properties
- Label (optional, inline editable on the edge midpoint)
- Direction: directed (arrow) or undirected (line) — toggle in Inspector
- Style: solid, dashed, dotted — toggle in Inspector
- Animated: optional flow animation (pulsing dot along edge)
- Edges render as smooth bezier curves, not straight lines

---

## 5. Right-Click Context Menu

### On canvas (empty space)
```
Add note                    N
Add resource from file…     R  →  [fuzzy search popup]
Add group                   G
Paste                       ⌘V
Select all                  ⌘A
```

### On a node
```
[Node title — greyed header]
─────────────────────────
Open content               ↵
Draw edge →
Duplicate                  ⌘D
─────────────────────────
Customise…                    →  [opens Inspector colour controls]
─────────────────────────
Delete                     ⌫
```

### On an edge
```
Edit label
Toggle direction
Toggle style  (solid / dashed / dotted)
Delete edge
```

### Resource fuzzy search popup
- Appears inline near the cursor, not a modal
- Searches indexed file names and paths across all resource roots
- Keyboard navigable (↑↓ Enter)
- Also shows recent files at top when query is empty

---

## 6. Content Viewer

### Single click → Inspector (right panel)
- Shows node title, type, attached file path, dot/colour controls, connected nodes list

### Double-click → Content tab (right panel)
- Renders attached file:
  - **Markdown**: rendered HTML, scrollable, code highlighting
  - **Image**: fit-to-panel display, click to zoom
  - **PDF**: embedded PDF viewer, paginated
  - **Plain text**: monospace, scrollable
  - **Note**: live editable textarea (autosaves)
- Panel is resizable — drag its left edge to make it wider for reading

### Second double-click (or button) → Full-screen reader
- Canvas hidden, full window given to content renderer
- Breadcrumb at top: `Project > Canvas > Node title`
- Esc or back arrow returns to canvas (remembers scroll/zoom position)

---

## 7. Terminal

- Lives in the **Terminal tab** of the right panel
- Full xterm.js PTY session with project working directory as CWD
- **Persistence**: the shell process lives as long as the app, independent of whether the panel is open or closed. Reopening the Terminal tab restores the live session — history, state, running processes intact.
- Panel resize → terminal reflows (xterm fit addon)
- ⌘T toggles the right panel open to Terminal tab from anywhere
- Multiple terminal sessions: `+` button in tab bar to add sessions, named tabs

---

## 8. Animations

All motion should be functional, not decorative. Fast.

| Interaction | Animation |
|---|---|
| Node drag | Spring physics, 200ms settle, no bounce on other nodes |
| Node creation | Scale in from 0.8 + fade, 150ms |
| Node deletion | Scale out + fade, 120ms |
| Panel slide in | Ease-out, 180ms |
| Panel slide out | Ease-in, 140ms |
| Zoom-level node transition | Cross-fade between representations, 150ms |
| Edge creation ghost line | Follows cursor in real-time, no lag |

---

## 9. What to Rip Out

The following elements from the current Codex build must be removed:

- All large descriptive buttons and section headers on the canvas/shell
- The persistent topbar/header navigation
- The duplicate terminal views (only one PTY panel)
- The oversized file list boxes (replace with compact list rows, 28px height max)
- The project nesting tree (replace with flat project + canvas switcher)
- Any `div` used as a giant labelled button for a feature that belongs in a menu
- The `NodeViewerScreen` route as a separate page route — it becomes the full-screen reader mode within the shell (no route change, just a layout mode)

---

## 10. Out of Scope (v1)

- Collaboration / multiplayer
- Cloud sync
- Mobile
- Custom themes (dark only for v1)
- Plugin system
