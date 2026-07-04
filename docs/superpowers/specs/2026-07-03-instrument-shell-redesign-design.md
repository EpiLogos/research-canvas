# Instrument Shell Redesign — Design Spec

**Date:** 2026-07-03
**Status:** Approved design, pending implementation plan
**Supersedes (UI portions of):** `2026-03-31-research-canvas-ui-redesign.md`, `2026-04-03-sidebar-panels-and-fixes-design.md`
**Companion mock:** `scratchpad/redesign-pitch.html` (Observatory direction, v2)

---

## 1. Problem

The desktop shell works but reads like a generic SaaS dashboard: standing panels on every
edge, actions exposed as competing buttons, and layers that float on top of one another. Three
concrete failures:

1. **Standing panels steal the surface.** The left overlay (`LeftOverlay.tsx`) floats over the
   canvas at a hardcoded `left: 26`, the right panel (`RightPanelSlot.tsx`) is a permanent docked
   column, and the lens switch is a pair of buttons hovering over the canvas. Nothing shares one
   layout; things overlap.
2. **Everything is a button.** `CanvasScreen.tsx` carries a top toolbar ("Add note node", "Add
   resource node", "Draw annotation") that *duplicates* actions already available via the
   `ContextMenu` component that exists in `packages/canvas/src/components/ContextMenu.tsx` and is
   barely used.
3. **One shell tries to serve three tasks.** Canvas, timeline, and reading all inhabit the same
   fixed chrome, so none is served well — reading is only a right-panel tab / fullscreen modal, not
   a first-class surface.

## 2. Users & intent

Single-user research instrument for developing the *Image of the Antichrist* theory. The user
works across three co-equal acts — **building the graph** (canvas), **reading/writing node
documents** (reading), and **reframing material temporally** (timeline) — with no single act
dominating. Desired feel: **calm and roomy**, closer to a DAW or NLE than a web app.

## 3. Design principles

1. **The stage is permanent; chrome is transient.** The active surface (canvas / timeline /
   reading) is the only thing that always occupies the center. Every other panel is *summoned*,
   used, and dismissed — it floats over the stage, it does not dock as a standing column.
2. **Each lens is a workspace.** Switching lens recomposes the surrounding chrome to the task
   (the Resolve Cut/Edit/Color model), rather than swapping only the middle of a fixed frame.
3. **Actions live in three channels, never as standing buttons:** the command palette (⌘K),
   context menus (right-click the object), and direct manipulation (drag, double-click). New
   capability is added as a palette line or a menu item — never a new on-screen panel.
4. **One accent, one semantic.** Cyan is the single UI accent. Amber is reserved exclusively for
   the archetypal-lighting register on the timeline, so "lighting" always reads as a distinct kind
   of signal, never decoration.
5. **Calm by default.** At rest the window is ~92% work surface: two thin persistent bars plus a
   status line, and nothing else.

## 4. Visual system — "Observatory"

Cool slate-black ground, starlight text, a cold silver-cyan accent; the trans-temporal register
made to feel like an instrument panel / star-chart.

### Color tokens

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#090d13` | window ground |
| `--bg-2` | `#0c1119` | stage ground |
| `--panel` | `#111825` | bars, rail |
| `--panel-2` | `#16202f` | node cards |
| `--float` | `#18202e` | summoned overlays |
| `--ink` | `#e4ebf4` | primary text |
| `--dim` | `#8797ab` | secondary text |
| `--faint` | `#5a6a7d` | labels, ticks |
| `--line` / `--line-2` / `--line-3` | `#1b2634` / `#2a3a4d` / `#3a4e64` | hairlines → borders |
| `--accent` | `#79c0d4` | **UI accent** (selection, active, links) |
| `--accent-deep` | `#3f7d90` | accent edges, secondary relations |
| `--amber` | `#d0a24a` | **archetypal-lighting semantic only** |
| `--live` | `#5fb8a0` | sync-OK indicator |

Neutrals carry a deliberate cool (blue) bias — not pure grey.

### Typography

Fonts must be inlined or use safe system stacks (Artifact/CSP blocks font CDNs); the desktop app
may bundle real faces later, but the roles are fixed:

- **Serif** (`Iowan Old Style` / `Palatino` / `Georgia`) — reading surface, node titles, display
  headings. Carries the contemplative, manuscript register.
- **Sans** (`system-ui` stack) — all UI chrome, labels, controls.
- **Mono** (`ui-monospace` / `SF Mono`) — coordinates, keys, ticks, terminal, uppercase eyebrow
  labels (with `.14–.2em` letter-spacing).

Reading column caps near 65ch; headings use `text-wrap: balance`; digit columns use
`font-variant-numeric: tabular-nums`.

## 5. Spatial model

```
┌────────────────────────────────────────────────────────┐
│ title bar (30px)                                        │
├────────────────────────────────────────────────────────┤
│ transport / orient bar (34px):  [lens switch] breadcrumb ⌘K │
├──┬─────────────────────────────────────────────────────┤
│  │                                                      │
│ r│                                                      │
│ a│                  STAGE  (permanent)                  │
│ i│           canvas · timeline · reading                │
│ l│                                                      │
│44│         ┌ summoned overlays float here ┐            │
├──┴─────────────────────────────────────────────────────┤
│ status strip (24px)                                     │
└────────────────────────────────────────────────────────┘
```

**Persistent chrome (always present, thin):**

- **Title bar (30px)** — app + active project name.
- **Transport / orient bar (34px)** — the lens switch (segmented control), a breadcrumb of where
  you are, and the ⌘K affordance. In the Timeline workspace this bar's function extends into a
  transport (below). In the Reading workspace it fades to near-invisible.
- **Rail (44px)** — the only persistent side chrome. Icons *summon* overlays; they are verbs, not
  modes. Order: Browser (⌘B), Search (⌘K), Inspector (⌘I), Sequences, Annotate — spacer — Terminal
  (⌘J), Settings.
- **Status strip (24px)** — sync state, node/relation counts, and which register the graph is being
  read in (trans-temporal vs datable).

**Summoned panels (transient, float over the stage — never resize it into a letterbox):**

- **Browser** — slides in from the rail as a floating card inset from the stage edges. Dismisses on
  click-away; a pin keeps it open. (See §7.)
- **Inspector** — **appears on node/edge selection** at the right edge as a floating card; a pin
  (⚲) keeps it while working a cluster. Hidden when nothing is selected. Also toggleable via ⌘I /
  rail.
- **Terminal (= agent)** — pulls up from the bottom edge on ⌘J, VS Code-style, over the stage.
  Draggable seam to size; ⌘J again to dismiss. (See §8.)

## 6. Lens = workspace

Switching lens recomposes the chrome. The lens switch (segmented control in the transport bar) and
double-click-to-read are the entry points.

| Lens | Key | Chrome composition |
|---|---|---|
| **Canvas** | ⌘1 | Rail + summonable browser + appear-on-select inspector. Full-bleed node graph. Terminal available (⌘J). |
| **Timeline** | ⌘2 | Rail + a **transport** (bottom floating bar: play/scrub time, play sequences) + an **amber lighting** toggle in the orient bar. Full width; no side panels by default. |
| **Reading** | ⌘3 | Rail, inspector, and transport bar all recede. Centered serif document column + margin table-of-contents. Content-tab moves here as the primary surface. Reached by lens switch **or** double-clicking a node. |

The transport in Timeline reuses the sequence-playback machinery
(`packages/canvas/src/sequences/`) — playing a sequence *is* scrubbing the transport.

## 7. The unified browser

Replaces the three stacked flat lists in `LeftOverlay.tsx` (Projects / Resource Folders / Files)
with one browser that has a clear spine:

- **Header = project switcher.** Click to swap projects or open recent. Not a buried list.
- **Graph / Files segmented toggle.**
  - **Graph** — the theory organised by *what things are*: Operators, Positions, Notes, Artworks,
    Coordinates — each group with a count, each row optionally tagged with its coordinate (e.g.
    `C-1.4`). Sourced from the joined Neo4j+layout data via the transport, not the filesystem.
  - **Files** — the real filesystem tree for dragging resources onto the canvas (resource roots
    management lives here).
- **Filter-as-you-type** narrows the *same* tree live. Search is a filter over the browser, not a
  separate mode that replaces the panel (retires the standalone `search` left-mode).

## 8. Terminal is the agent

There is **no separate agent panel.** The bottom pullout is a terminal, and that terminal is where
the agent lives: the user types instructions, the agent acts on the graph and reports back inline in
the same stream. Consequences:

- The standalone `AgentActivityPanel` / `agentActivityStore` surface is removed as a *panel*; agent
  activity renders inline in the terminal stream. (Whether the underlying activity store is reused
  to render terminal lines is an implementation detail.)
- Bottom dock supports multiple terminal sessions as tabs (`＋` to add), project-scoped cwd as
  today (`pty/session.rs`).

## 9. Interaction grammar

Delete standing action buttons; route everything through three channels:

1. **Command palette (⌘K)** — create node, switch lens, open/switch project, run sequence, open
   terminal, attach resource folder, etc. The primary "do anything" surface. Grows by lines, not
   buttons.
2. **Context menus** — right-click canvas / node / edge / browser row / file. Lean on the existing
   `ContextMenu` component (already wired in `CanvasView.tsx` for canvas/node/edge). Remove the
   `CanvasScreen` toolbar entirely.
3. **Direct manipulation** — drag a file onto the canvas → resource node; drag node handle → edge;
   double-click empty canvas → note node; double-click a node → reading lens.

### Keyboard map (initial)

| Keys | Action |
|---|---|
| ⌘K | Command palette |
| ⌘1 / ⌘2 / ⌘3 | Canvas / Timeline / Reading lens |
| ⌘B | Browser toggle |
| ⌘I | Inspector toggle |
| ⌘J | Terminal pullout toggle |
| Esc | Dismiss the top-most summoned panel |

## 10. Component impact map

Existing → redesigned. This is a re-composition of existing components, not a rewrite.

| Current | Change |
|---|---|
| `layout/Shell.tsx` | Becomes the workspace compositor: owns lens→workspace mapping and which overlays are summoned. Loses the floating `lens-switch` div (moves into transport bar). |
| `layout/IconStrip.tsx` | Becomes the **rail**; icons summon overlays rather than toggling a shared left-mode. |
| `layout/LeftOverlay.tsx` | Becomes the **summoned browser** overlay; internally the unified Graph/Files/filter browser (§7). No longer position-hacked over the canvas. |
| `layout/RightPanelSlot.tsx` | Split: **Inspector** becomes an appear-on-select floating overlay; **Content** moves into the Reading lens; **Terminal** moves to the bottom dock; **Agent** tab is removed (§8). |
| `layout/useShellLayout.ts` | Reworked for the new model: per-lens workspace state, summoned-overlay visibility + pinning, bottom-dock height, instead of fixed left/right widths. |
| `features/canvas/CanvasScreen.tsx` | Remove the top toolbar; creation/annotation move to palette + context menu + direct manipulation. |
| new: transport bar | Extracted from the current `lens-switch` + sequence controls. |
| new: bottom dock | Hosts `TerminalPane`; VS Code-style pullout. |
| `features/agent/*` | Panel removed; activity rendered inline in terminal. |

## 11. Scope

**In scope (v1 of the redesign):** the spatial model (§5), the three workspaces (§6), the unified
browser (§7), terminal-as-agent bottom dock (§8), interaction-grammar cleanup (§9), and the
Observatory visual system (§4).

**Out of scope / future:** dockable/tear-off panels beyond the fixed summon behaviours; saved custom
workspace layouts; multi-window; theming beyond Observatory; the web read-layer's adoption of the
new visual system (follows once desktop settles).

## 12. Open implementation questions

- Overlay dismissal precedence when several are pinned (Esc order).
- Whether the browser overlay *pushes* the stage or purely floats over it when pinned (default:
  floats; pinned-push is a possible affordance).
- Reading-lens editing affordances (inline edit vs explicit edit toggle) — deferred to the reading
  sub-plan.
- Exact reuse of `agentActivityStore` for rendering agent lines inside the terminal stream.
