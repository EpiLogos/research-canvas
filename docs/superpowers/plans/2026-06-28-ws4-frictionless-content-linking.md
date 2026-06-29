# Frictionless Content + Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make adding content (text + images, via paste and drag-and-drop) and creating links (markdown-file/source → node, and node → node typed relationships) **first-class, low-friction** actions — surfaced as direct affordances, never buried in menus. Concretely: (1) a shared, typed relationship vocabulary covering the spec's nine relationship kinds; (2) the WS0 §7 converters between BlockNote/ProseMirror body JSON and Markdown — `blockNoteJsonToMarkdown` / `markdownToBlockNoteJson` — implemented in their single home `packages/exporter/src/renderMarkdown.ts` (exported from `@research-canvas/exporter`) so a dropped/pasted `.md` becomes node content and a node body can be linked out as `.md`; (3) helpers that turn pasted text, pasted/dropped image files, and dropped markdown files into BlockNote blocks ready to splice into a node body; (4) a Rust command that imports an external image file into the per-node `assets/<graphNodeId>/<file>` workspace folder and returns its workspace-relative path; (5) a `WorkspaceTransport`-backed content/linking store slice that wires those helpers and the contract graph methods (`updateGraphNode`, `connectGraphNodes`, `createGraphNode`) into store actions; (6) UI affordances (a paste/drop surface on the node-document view, an inline "Link a file…" picker, and an inline node→node "Link to…" relationship picker).

**Architecture:** Desktop Tauri v2 app, pnpm monorepo. Theory substance lives in Neo4j (read/written through WS2's `GraphRepository` exposed via WS5/§5's `WorkspaceTransport` graph methods); layout lives in SQLite. This workstream adds **no new persistence store** — it composes the contract methods. New pure logic lives in `packages/canvas/src/content/` (vitest-tested, no React/Tauri). The body↔Markdown converters are **not** re-created here — per WS0 §7 their single home is `packages/exporter/src/renderMarkdown.ts` (exported from `@research-canvas/exporter`); this plan extends that file (Tasks 2–4) and imports the converters into the canvas content helpers. The Rust image-import command lives in `apps/desktop/src-tauri/src/commands/assets.rs`. UI wiring lives under `apps/desktop/src/features/canvas/`. All data access goes through `WorkspaceTransport` — never `neo4rs`/Tauri directly from view code (design §3.2).

**Tech Stack:** Tauri v2; React 19 + Vite 7 + TypeScript 5.9; pnpm monorepo; XYFlow `@xyflow/react` v12.8.5; Zustand v5 vanilla stores; Rust (`rusqlite`, `neo4rs`, `tokio`) backend; vitest for frontend; `cargo test --test-threads=1` for Rust.

## Global Constraints

- Tauri v2; React 19 + Vite 7 + TypeScript 5.9; pnpm monorepo; XYFlow @xyflow/react v12.8.5; Zustand v5 vanilla stores.
- Test-first (TDD) for every backend repository, frontend state model, and export behavior.
- Prefer REAL integration tests (real SQLite in temp dir, real Neo4j against an ephemeral/docker instance, real fixture filesystem) over mocks.
- ALWAYS run Rust tests with `--test-threads=1`.
- Keep file/folder/package names per the repo's existing conventions.

---

## Dependencies on other workstreams (read before starting)

This plan **consumes** types and methods defined in the shared contracts doc `docs/superpowers/plans/2026-06-28-ws0-contracts-and-architecture.md` and produced by earlier workstreams. The contract names are authoritative; do not invent alternates.

- **WS0 contracts (§5.1):** TypeScript types `EntityType`, `GraphNode`, `GraphRelationship`, `GraphNodePatch`, `NewGraphNodeInput`. These are exported from `@research-canvas/desktop-api` (`packages/desktop-api/src/index.ts`).
- **WS2/§5.2 (`WorkspaceTransport` graph methods):** `updateGraphNode(input: { graphNodeId: string; patch: GraphNodePatch }): Promise<GraphNode>`, `createGraphNode(input: NewGraphNodeInput): Promise<GraphNode>`, `connectGraphNodes(input: { sourceGraphNodeId: string; targetGraphNodeId: string; relType: string; properties?: Record<string, unknown> }): Promise<GraphRelationship>`, `readGraphNode(input: { graphNodeId: string }): Promise<GraphNode>`, `searchGraph(input: { query: string; limit?: number }): Promise<GraphNode[]>`. These exist on `WorkspaceTransport` after WS2.
- **WS0 §7 (body format):** node `body` is a BlockNote document JSON **string**; empty body is the literal `"[]"`; embedded images use BlockNote image blocks with `props.url` pointing at a workspace-relative path `assets/<graphNodeId>/<file>`.
- **WS3 (node-as-document):** provides the BlockNote editor host component and is the consumer of this workstream's paste/drop surface and link pickers. WS4 produces editor-agnostic helpers (block builders + body splicers) that WS3's editor host calls; this plan does **not** depend on WS3 being finished to land its pure logic and Rust command — only the final UI-wiring Task (Task 13) mounts onto WS3's document view and is the last task.

If a `Consumes` signature below is not yet present in the repo when you start, stub it minimally in `packages/desktop-api/src/index.ts` exactly as written here (it will be reconciled with WS2's real implementation), so this plan's tests compile and pass against the contract shape.

---

## Module map (what this plan creates)

```
packages/exporter/src/
  renderMarkdown.ts             # EXISTING file — extended with the WS0 §7 converters
                                #   blockNoteJsonToMarkdown / markdownToBlockNoteJson +
                                #   BlockNoteBlock / BlockNoteInline types (Tasks 2–4)
  renderMarkdown.test.ts        # new describe blocks for the converters (Tasks 2–4)

packages/canvas/src/content/
  relationshipKinds.ts          # typed vocabulary + guards (Task 1)
  relationshipKinds.test.ts
  contentBlocks.ts              # paragraphsToBlocks / imageBlock / appendBlocks / spliceBlocks (Tasks 5–7)
  contentBlocks.test.ts
  pasteIngest.ts                # classifyPasteItems / classifyDropItems (Task 8)
  pasteIngest.test.ts
  contentLinkingActions.ts      # createContentLinkingActions (Tasks 9–12)
  contentLinkingActions.test.ts
  index.ts                      # re-exports (Task 1 onward)

apps/desktop/src-tauri/src/commands/
  assets.rs                     # import_node_image_command (Tasks 13a–13c)

apps/desktop/src/features/canvas/
  NodeContentDropSurface.tsx    # paste/drop affordance (Task 14)
  LinkFilePicker.tsx            # inline "Link a file…" (Task 14)
  LinkNodePicker.tsx            # inline node→node "Link to…" (Task 14)
```

The body↔Markdown converters are **not** created under `packages/canvas/src/content/` — per WS0 §7 their single home is `packages/exporter/src/renderMarkdown.ts`. The canvas content helpers import `blockNoteJsonToMarkdown`, `markdownToBlockNoteJson`, and the `BlockNoteBlock` / `BlockNoteInline` types from `@research-canvas/exporter`.

The `packages/canvas/src/index.ts` barrel re-exports everything from `./content/index` (added in Task 1).

### Dependency direction: `packages/canvas` → `@research-canvas/exporter` (no cycle)

`@research-canvas/exporter` depends only on `@research-canvas/schema` (see `packages/exporter/package.json`); it does **not** depend on `@research-canvas/canvas`. Therefore adding `@research-canvas/exporter` as a dependency of `@research-canvas/canvas` introduces **no TypeScript project-reference cycle**. This plan adds that dependency once, in Task 2:

- `packages/canvas/package.json` → add `"@research-canvas/exporter": "workspace:*"` to `dependencies`.
- `packages/canvas/tsconfig.json` → add `{ "path": "../exporter" }` to `references`.

The `@research-canvas/exporter` path alias already exists in `tsconfig.base.json` (`"@research-canvas/exporter": ["packages/exporter/src/index.ts"]`), and `packages/exporter/package.json` sets both `main` and `types` to `./src/index.ts`, so the import type-resolves against the exporter's source directly. (If a future `tsc -b` composite build rejects the reference because `packages/exporter/tsconfig.json` is `noEmit: true` — exporter emits no declarations for a composite consumer — the documented fallback is to import the two converters and their types through `@research-canvas/desktop-api`, which is the frontend's normal contract barrel and can re-export them from `@research-canvas/exporter`; only if neither path works, duplicate the converters into `packages/canvas/src/content/` with an explicit `// SHARED SOURCE: keep in sync with packages/exporter/src/renderMarkdown.ts (WS0 §7)` note. Prefer the direct dependency; resort to duplication only as a last resort.)

---

## Task 1 — Relationship-kind vocabulary (shared, typed)

**Files:**
- Create `packages/canvas/src/content/relationshipKinds.ts`
- Create `packages/canvas/src/content/relationshipKinds.test.ts`
- Create `packages/canvas/src/content/index.ts`
- Modify `packages/canvas/src/index.ts` (add one re-export line after the last existing `export * from` line, line 13)

**Interfaces:**
- Consumes: none (this is the root of the workstream).
- Produces:
  - `type RelationshipKind = "INSTANTIATES" | "ECHOES" | "CAUSES" | "INFLUENCES" | "OPPOSES" | "INHERITS" | "TRANSFORMS_INTO" | "LOCATED_AT" | "SOURCED_FROM" | "RESONATES_WITH"`
  - `interface RelationshipKindOption { kind: RelationshipKind; label: string; description: string }`
  - `const RELATIONSHIP_KINDS: readonly RelationshipKindOption[]`
  - `function isRelationshipKind(value: string): value is RelationshipKind`

Steps:

- [ ] 1.1 Write the failing test. Create `packages/canvas/src/content/relationshipKinds.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  RELATIONSHIP_KINDS,
  isRelationshipKind,
  type RelationshipKind,
} from "./relationshipKinds";

describe("relationshipKinds", () => {
  it("lists exactly the nine spec relationship kinds in order", () => {
    expect(RELATIONSHIP_KINDS.map((option) => option.kind)).toEqual([
      "INSTANTIATES",
      "ECHOES",
      "CAUSES",
      "INFLUENCES",
      "OPPOSES",
      "INHERITS",
      "TRANSFORMS_INTO",
      "LOCATED_AT",
      "SOURCED_FROM",
      "RESONATES_WITH",
    ]);
  });

  it("gives every kind a non-empty human label and description", () => {
    for (const option of RELATIONSHIP_KINDS) {
      expect(option.label.length).toBeGreaterThan(0);
      expect(option.description.length).toBeGreaterThan(0);
    }
  });

  it("recognises valid SCREAMING_SNAKE kinds and rejects others", () => {
    expect(isRelationshipKind("CAUSES")).toBe(true);
    expect(isRelationshipKind("causes")).toBe(false);
    expect(isRelationshipKind("RELATES")).toBe(false);
  });

  it("narrows the type through the guard", () => {
    const raw = "OPPOSES";
    if (isRelationshipKind(raw)) {
      const kind: RelationshipKind = raw;
      expect(kind).toBe("OPPOSES");
    }
  });
});
```

- [ ] 1.2 Run it, expect FAIL. Command: `pnpm vitest run packages/canvas/src/content/relationshipKinds.test.ts`. Expected: failure `Failed to resolve import "./relationshipKinds"` (module does not exist yet).

- [ ] 1.3 Minimal implementation. Create `packages/canvas/src/content/relationshipKinds.ts`:

```ts
export type RelationshipKind =
  | "INSTANTIATES"
  | "ECHOES"
  | "CAUSES"
  | "INFLUENCES"
  | "OPPOSES"
  | "INHERITS"
  | "TRANSFORMS_INTO"
  | "LOCATED_AT"
  | "SOURCED_FROM"
  | "RESONATES_WITH";

export interface RelationshipKindOption {
  kind: RelationshipKind;
  label: string;
  description: string;
}

export const RELATIONSHIP_KINDS: readonly RelationshipKindOption[] = [
  { kind: "INSTANTIATES", label: "Instantiates", description: "This datable instance realizes a trans-temporal pattern (the spine)." },
  { kind: "ECHOES", label: "Echoes", description: "A weaker recurrence of a pattern, work, or dynamic." },
  { kind: "CAUSES", label: "Causes", description: "Direct historical consequence." },
  { kind: "INFLUENCES", label: "Influences", description: "Ideological or textual transmission." },
  { kind: "OPPOSES", label: "Opposes", description: "Polarity, read symmetrically (Christ ↔ Antichrist)." },
  { kind: "INHERITS", label: "Inherits", description: "Lineage, dynastic or institutional succession." },
  { kind: "TRANSFORMS_INTO", label: "Transforms into", description: "Metamorphosis (visible empire → invisible governance)." },
  { kind: "LOCATED_AT", label: "Located at", description: "Placement at a Place node." },
  { kind: "SOURCED_FROM", label: "Sourced from", description: "Provenance to a Source or text." },
  { kind: "RESONATES_WITH", label: "Resonates with", description: "Archetypal-field link to an archetype or operator." },
] as const;

const RELATIONSHIP_KIND_SET: ReadonlySet<string> = new Set(
  RELATIONSHIP_KINDS.map((option) => option.kind),
);

export function isRelationshipKind(value: string): value is RelationshipKind {
  return RELATIONSHIP_KIND_SET.has(value);
}
```

- [ ] 1.4 Create the content barrel. Create `packages/canvas/src/content/index.ts`:

```ts
export * from "./relationshipKinds";
```

- [ ] 1.5 Re-export from the canvas package barrel. In `packages/canvas/src/index.ts`, add this line immediately after the existing final line `export * from "./state/canvasStore";`:

```ts
export * from "./content";
```

- [ ] 1.6 Run the test, expect PASS. Command: `pnpm vitest run packages/canvas/src/content/relationshipKinds.test.ts`. Expected: `4 passed`.

- [ ] 1.7 Type-check the workspace. Command: `pnpm exec tsc -b`. Expected: exits 0, no errors.

- [ ] 1.8 Commit. Command:

```bash
git add packages/canvas/src/content/relationshipKinds.ts packages/canvas/src/content/relationshipKinds.test.ts packages/canvas/src/content/index.ts packages/canvas/src/index.ts && git commit -m "feat(ws4): typed relationship-kind vocabulary"
```

---

## Task 2 — `blockNoteJsonToMarkdown` (body JSON → Markdown) — in the exporter (WS0 §7 single home)

**Files:**
- Modify `packages/canvas/package.json` (add `"@research-canvas/exporter": "workspace:*"` to `dependencies`)
- Modify `packages/canvas/tsconfig.json` (add `{ "path": "../exporter" }` to `references`)
- Modify `packages/exporter/src/renderMarkdown.ts` (append the converter + its types)
- Create `packages/exporter/src/renderMarkdown.test.ts`

**Interfaces:**
- Consumes: none.
- Produces (all exported from `packages/exporter/src/renderMarkdown.ts`, re-exported through `@research-canvas/exporter`):
  - `interface BlockNoteInline { type: "text"; text: string; styles?: { bold?: boolean; italic?: boolean; code?: boolean } }`
  - `interface BlockNoteBlock { type: string; props?: Record<string, unknown>; content?: BlockNoteInline[]; children?: BlockNoteBlock[] }`
  - `function blockNoteJsonToMarkdown(bodyJson: string): string` (contracts §7 signature)

This implements the contract function `blockNoteJsonToMarkdown(bodyJson: string): string` (WS0 §7) **in its single home**, `packages/exporter/src/renderMarkdown.ts` — the same file that already exports `renderMarkdownToHtml` for the static web layer (§7). It is **not** re-created under `packages/canvas/src/content/`; the canvas content helpers (Tasks 5, 9, 11) import it from `@research-canvas/exporter`. It supports the BlockNote block subset we author: `paragraph`, `heading` (props.level 1–3), `bulletListItem`, `numberedListItem`, `quote`, `codeBlock`, `image` (props.url, props.caption). Unknown block types render their text content as a paragraph. Empty body (`""` or `"[]"`) yields `""`.

Steps:

- [ ] 2.1a Add the exporter dependency to the canvas package (no cycle — see "Dependency direction" above; the exporter depends only on `@research-canvas/schema`). In `packages/canvas/package.json`, add to `dependencies`:

```json
    "@research-canvas/exporter": "workspace:*",
```

In `packages/canvas/tsconfig.json`, add to the `references` array (alongside the existing `{ "path": "../schema" }`):

```json
    { "path": "../exporter" }
```

Then run `pnpm install` so the workspace symlink is created. (The `@research-canvas/exporter` path alias already exists in `tsconfig.base.json`.)

- [ ] 2.1 Write the failing test. Create `packages/exporter/src/renderMarkdown.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { blockNoteJsonToMarkdown } from "./renderMarkdown";

describe("blockNoteJsonToMarkdown", () => {
  it("returns empty string for the empty-body sentinels", () => {
    expect(blockNoteJsonToMarkdown("")).toBe("");
    expect(blockNoteJsonToMarkdown("[]")).toBe("");
  });

  it("renders a paragraph with inline styles", () => {
    const json = JSON.stringify([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Plain " },
          { type: "text", text: "bold", styles: { bold: true } },
          { type: "text", text: " and " },
          { type: "text", text: "code", styles: { code: true } },
        ],
      },
    ]);
    expect(blockNoteJsonToMarkdown(json)).toBe("Plain **bold** and `code`");
  });

  it("renders headings at the right level", () => {
    const json = JSON.stringify([
      { type: "heading", props: { level: 2 }, content: [{ type: "text", text: "Title" }] },
    ]);
    expect(blockNoteJsonToMarkdown(json)).toBe("## Title");
  });

  it("renders bullet and numbered lists and a quote and a code block", () => {
    const json = JSON.stringify([
      { type: "bulletListItem", content: [{ type: "text", text: "one" }] },
      { type: "bulletListItem", content: [{ type: "text", text: "two" }] },
      { type: "numberedListItem", content: [{ type: "text", text: "first" }] },
      { type: "quote", content: [{ type: "text", text: "said" }] },
      { type: "codeBlock", content: [{ type: "text", text: "x = 1" }] },
    ]);
    expect(blockNoteJsonToMarkdown(json)).toBe(
      "- one\n- two\n1. first\n> said\n```\nx = 1\n```",
    );
  });

  it("renders an image block to markdown image syntax", () => {
    const json = JSON.stringify([
      { type: "image", props: { url: "assets/n1/cat.png", caption: "A cat" } },
    ]);
    expect(blockNoteJsonToMarkdown(json)).toBe("![A cat](assets/n1/cat.png)");
  });
});
```

- [ ] 2.2 Run it, expect FAIL. Command: `pnpm vitest run packages/exporter/src/renderMarkdown.test.ts`. Expected: failure `blockNoteJsonToMarkdown is not a function` (the import resolves to the existing `renderMarkdown.ts`, but the symbol does not exist yet).

- [ ] 2.3 Minimal implementation (forward direction only). Append to `packages/exporter/src/renderMarkdown.ts` (below the existing `renderMarkdownToHtml` machinery; keep the existing exports untouched):

```ts
export interface BlockNoteInline {
  type: "text";
  text: string;
  styles?: { bold?: boolean; italic?: boolean; code?: boolean };
}

export interface BlockNoteBlock {
  type: string;
  props?: Record<string, unknown>;
  content?: BlockNoteInline[];
  children?: BlockNoteBlock[];
}

function isEmptyBody(bodyJson: string): boolean {
  const trimmed = bodyJson.trim();
  return trimmed === "" || trimmed === "[]";
}

function inlineToMarkdown(inline: BlockNoteInline): string {
  let text = inline.text;
  if (inline.styles?.code) {
    text = "`" + text + "`";
  }
  if (inline.styles?.bold) {
    text = "**" + text + "**";
  }
  if (inline.styles?.italic) {
    text = "*" + text + "*";
  }
  return text;
}

function inlineContent(block: BlockNoteBlock): string {
  return (block.content ?? []).map(inlineToMarkdown).join("");
}

function blockToMarkdown(block: BlockNoteBlock): string {
  switch (block.type) {
    case "heading": {
      const level = Number(block.props?.level ?? 1);
      const clamped = Math.min(Math.max(level, 1), 6);
      return "#".repeat(clamped) + " " + inlineContent(block);
    }
    case "bulletListItem":
      return "- " + inlineContent(block);
    case "numberedListItem":
      return "1. " + inlineContent(block);
    case "quote":
      return "> " + inlineContent(block);
    case "codeBlock":
      return "```\n" + inlineContent(block) + "\n```";
    case "image": {
      const url = String(block.props?.url ?? "");
      const caption = String(block.props?.caption ?? "");
      return "![" + caption + "](" + url + ")";
    }
    case "paragraph":
    default:
      return inlineContent(block);
  }
}

export function blockNoteJsonToMarkdown(bodyJson: string): string {
  if (isEmptyBody(bodyJson)) {
    return "";
  }

  let blocks: BlockNoteBlock[];
  try {
    blocks = JSON.parse(bodyJson) as BlockNoteBlock[];
  } catch {
    return "";
  }

  if (!Array.isArray(blocks)) {
    return "";
  }

  return blocks.map(blockToMarkdown).join("\n");
}
```

- [ ] 2.4 Re-export from the exporter barrel. In `packages/exporter/src/index.ts`, add alongside the existing `export { renderMarkdownToHtml } from "./renderMarkdown";` line:

```ts
export { blockNoteJsonToMarkdown } from "./renderMarkdown";
export type { BlockNoteBlock, BlockNoteInline } from "./renderMarkdown";
```

- [ ] 2.5 Run the test, expect PASS. Command: `pnpm vitest run packages/exporter/src/renderMarkdown.test.ts`. Expected: `5 passed`.

- [ ] 2.6 Commit. Command:

```bash
git add packages/canvas/package.json packages/canvas/tsconfig.json packages/exporter/src/renderMarkdown.ts packages/exporter/src/renderMarkdown.test.ts packages/exporter/src/index.ts pnpm-lock.yaml && git commit -m "feat(ws4): blockNoteJsonToMarkdown converter in exporter (WS0 §7 single home)"
```

---

## Task 3 — `markdownToBlockNoteJson` (Markdown → body JSON) — in the exporter (WS0 §7 single home)

**Files:**
- Modify `packages/exporter/src/renderMarkdown.ts` (append the new function)
- Modify `packages/exporter/src/renderMarkdown.test.ts` (append a `describe` block)
- Modify `packages/exporter/src/index.ts` (add the `markdownToBlockNoteJson` re-export)

**Interfaces:**
- Consumes: `BlockNoteBlock`, `BlockNoteInline` (Task 2, same file).
- Produces: `function markdownToBlockNoteJson(markdown: string): string` (contracts §7 signature), exported from `packages/exporter/src/renderMarkdown.ts` and re-exported through `@research-canvas/exporter`.

This implements the contract inverse `markdownToBlockNoteJson(markdown: string): string` (WS0 §7) **in its single home** alongside `blockNoteJsonToMarkdown` in `packages/exporter/src/renderMarkdown.ts`. It parses the same block subset: ATX headings, `-`/`*`/`+` bullets, `N.` numbered items, `>` quotes, fenced ``` code, `![alt](url)` standalone images, and paragraphs; inline `**bold**`, `*italic*`, `` `code` ``. Empty/whitespace markdown yields the empty-body sentinel `"[]"`.

Steps:

- [ ] 3.1 Write the failing test. Append to `packages/exporter/src/renderMarkdown.test.ts` (add the import to the existing import line and a new describe at the end):

Change the existing import to:

```ts
import { blockNoteJsonToMarkdown, markdownToBlockNoteJson } from "./renderMarkdown";
```

Append:

```ts
describe("markdownToBlockNoteJson", () => {
  it("returns the empty-body sentinel for blank input", () => {
    expect(markdownToBlockNoteJson("")).toBe("[]");
    expect(markdownToBlockNoteJson("   \n  ")).toBe("[]");
  });

  it("parses a heading into a heading block with level", () => {
    const blocks = JSON.parse(markdownToBlockNoteJson("## Title"));
    expect(blocks).toEqual([
      { type: "heading", props: { level: 2 }, content: [{ type: "text", text: "Title" }] },
    ]);
  });

  it("parses inline bold, italic, and code", () => {
    const blocks = JSON.parse(markdownToBlockNoteJson("a **b** *c* `d`"));
    expect(blocks[0].content).toEqual([
      { type: "text", text: "a " },
      { type: "text", text: "b", styles: { bold: true } },
      { type: "text", text: " " },
      { type: "text", text: "c", styles: { italic: true } },
      { type: "text", text: " " },
      { type: "text", text: "d", styles: { code: true } },
    ]);
  });

  it("parses bullets, numbers, quote, fenced code, and a standalone image", () => {
    const md = "- one\n- two\n1. first\n> said\n```\nx = 1\n```\n![A cat](assets/n1/cat.png)";
    const blocks = JSON.parse(markdownToBlockNoteJson(md));
    expect(blocks).toEqual([
      { type: "bulletListItem", content: [{ type: "text", text: "one" }] },
      { type: "bulletListItem", content: [{ type: "text", text: "two" }] },
      { type: "numberedListItem", content: [{ type: "text", text: "first" }] },
      { type: "quote", content: [{ type: "text", text: "said" }] },
      { type: "codeBlock", content: [{ type: "text", text: "x = 1" }] },
      { type: "image", props: { url: "assets/n1/cat.png", caption: "A cat" } },
    ]);
  });
});
```

- [ ] 3.2 Run it, expect FAIL. Command: `pnpm vitest run packages/exporter/src/renderMarkdown.test.ts`. Expected: failure `markdownToBlockNoteJson is not a function` (import resolves but symbol missing).

- [ ] 3.3 Minimal implementation. Append to `packages/exporter/src/renderMarkdown.ts`:

```ts
function parseInline(text: string): BlockNoteInline[] {
  const out: BlockNoteInline[] = [];
  let index = 0;
  let plain = "";

  const flushPlain = () => {
    if (plain.length > 0) {
      out.push({ type: "text", text: plain });
      plain = "";
    }
  };

  while (index < text.length) {
    if (text.startsWith("**", index)) {
      const end = text.indexOf("**", index + 2);
      if (end !== -1) {
        flushPlain();
        out.push({ type: "text", text: text.slice(index + 2, end), styles: { bold: true } });
        index = end + 2;
        continue;
      }
    }
    if (text[index] === "`") {
      const end = text.indexOf("`", index + 1);
      if (end !== -1) {
        flushPlain();
        out.push({ type: "text", text: text.slice(index + 1, end), styles: { code: true } });
        index = end + 1;
        continue;
      }
    }
    if (text[index] === "*" && !text.startsWith("**", index)) {
      const end = text.indexOf("*", index + 1);
      if (end !== -1) {
        flushPlain();
        out.push({ type: "text", text: text.slice(index + 1, end), styles: { italic: true } });
        index = end + 1;
        continue;
      }
    }
    plain += text[index];
    index += 1;
  }

  flushPlain();
  return out;
}

export function markdownToBlockNoteJson(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: BlockNoteBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({
        type: "heading",
        props: { level: heading[1].length },
        content: parseInline(heading[2].trim()),
      });
      index += 1;
      continue;
    }

    const image = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (image) {
      blocks.push({ type: "image", props: { url: image[2], caption: image[1] } });
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) {
        index += 1;
      }
      blocks.push({ type: "codeBlock", content: [{ type: "text", text: codeLines.join("\n") }] });
      continue;
    }

    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      blocks.push({ type: "quote", content: parseInline(quote[1].trim()) });
      index += 1;
      continue;
    }

    const bullet = line.match(/^[-*+]\s+(.*)$/);
    if (bullet) {
      blocks.push({ type: "bulletListItem", content: parseInline(bullet[1].trim()) });
      index += 1;
      continue;
    }

    const numbered = line.match(/^\d+\.\s+(.*)$/);
    if (numbered) {
      blocks.push({ type: "numberedListItem", content: parseInline(numbered[1].trim()) });
      index += 1;
      continue;
    }

    blocks.push({ type: "paragraph", content: parseInline(line.trim()) });
    index += 1;
  }

  if (blocks.length === 0) {
    return "[]";
  }

  return JSON.stringify(blocks);
}
```

- [ ] 3.4 Re-export from the exporter barrel. In `packages/exporter/src/index.ts`, add alongside the converter exports added in Task 2.4:

```ts
export { markdownToBlockNoteJson } from "./renderMarkdown";
```

- [ ] 3.5 Run the test, expect PASS. Command: `pnpm vitest run packages/exporter/src/renderMarkdown.test.ts`. Expected: `9 passed`.

- [ ] 3.6 Commit. Command:

```bash
git add packages/exporter/src/renderMarkdown.ts packages/exporter/src/renderMarkdown.test.ts packages/exporter/src/index.ts && git commit -m "feat(ws4): markdownToBlockNoteJson converter in exporter (WS0 §7 single home)"
```

---

## Task 4 — Round-trip stability for body↔markdown

**Files:**
- Modify `packages/exporter/src/renderMarkdown.test.ts` (append one `describe`)

**Interfaces:**
- Consumes: `blockNoteJsonToMarkdown`, `markdownToBlockNoteJson` (Tasks 2–3).
- Produces: nothing new (regression lock).

This guarantees a dropped `.md` → body → exported `.md` is stable, the load-bearing property for the linking-a-markdown-file feature and the static web layer (§7). No implementation change is expected; if the round-trip fails, fix `packages/exporter/src/renderMarkdown.ts` minimally to satisfy it.

Steps:

- [ ] 4.1 Write the failing (or already-passing) test. Append to `packages/exporter/src/renderMarkdown.test.ts`:

```ts
describe("body ↔ markdown round-trip", () => {
  const markdown =
    "# Heading\nA paragraph with **bold** and `code`.\n- one\n- two\n> a quote\n```\ncode block\n```\n![cap](assets/n/i.png)";

  it("markdown → json → markdown is stable", () => {
    const json = markdownToBlockNoteJson(markdown);
    expect(blockNoteJsonToMarkdown(json)).toBe(markdown);
  });

  it("json → markdown → json is stable for a known body", () => {
    const json = JSON.stringify([
      { type: "heading", props: { level: 1 }, content: [{ type: "text", text: "H" }] },
      { type: "paragraph", content: [{ type: "text", text: "p" }] },
    ]);
    const roundTripped = markdownToBlockNoteJson(blockNoteJsonToMarkdown(json));
    expect(JSON.parse(roundTripped)).toEqual(JSON.parse(json));
  });
});
```

- [ ] 4.2 Run it. Command: `pnpm vitest run packages/exporter/src/renderMarkdown.test.ts`. Expected: `11 passed`. If either round-trip fails, the failure message will show the diff (e.g. `Expected "...code..." Received "...code ..."`); fix the converter that introduced the discrepancy (most likely trailing-space or list-marker handling) and re-run until `11 passed`.

- [ ] 4.3 Commit. Command:

```bash
git add packages/exporter/src/renderMarkdown.test.ts packages/exporter/src/renderMarkdown.ts && git commit -m "test(ws4): body↔markdown round-trip stability"
```

---

## Task 5 — `paragraphsToBlocks` (pasted plain text → blocks)

**Files:**
- Create `packages/canvas/src/content/contentBlocks.ts`
- Create `packages/canvas/src/content/contentBlocks.test.ts`
- Modify `packages/canvas/src/content/index.ts` (add one re-export line)

**Interfaces:**
- Consumes: `BlockNoteBlock` (Task 2, imported from `@research-canvas/exporter` — its single home is the exporter's `renderMarkdown.ts`).
- Produces: `function paragraphsToBlocks(text: string): BlockNoteBlock[]`

Turns pasted plain text into paragraph blocks (one block per non-empty line group), the minimal-friction "paste text" primitive.

Steps:

- [ ] 5.1 Write the failing test. Create `packages/canvas/src/content/contentBlocks.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { paragraphsToBlocks } from "./contentBlocks";

describe("paragraphsToBlocks", () => {
  it("returns no blocks for empty text", () => {
    expect(paragraphsToBlocks("")).toEqual([]);
    expect(paragraphsToBlocks("   \n\n ")).toEqual([]);
  });

  it("makes one paragraph block per non-empty line", () => {
    expect(paragraphsToBlocks("first\nsecond")).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "first" }] },
      { type: "paragraph", content: [{ type: "text", text: "second" }] },
    ]);
  });

  it("skips blank lines between paragraphs", () => {
    expect(paragraphsToBlocks("a\n\n\nb")).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "a" }] },
      { type: "paragraph", content: [{ type: "text", text: "b" }] },
    ]);
  });
});
```

- [ ] 5.2 Run it, expect FAIL. Command: `pnpm vitest run packages/canvas/src/content/contentBlocks.test.ts`. Expected: `Failed to resolve import "./contentBlocks"`.

- [ ] 5.3 Minimal implementation. Create `packages/canvas/src/content/contentBlocks.ts`:

```ts
import type { BlockNoteBlock } from "@research-canvas/exporter";

export function paragraphsToBlocks(text: string): BlockNoteBlock[] {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => ({
      type: "paragraph",
      content: [{ type: "text", text: line }],
    }));
}
```

- [ ] 5.4 Re-export from the content barrel. In `packages/canvas/src/content/index.ts`, add:

```ts
export * from "./contentBlocks";
```

- [ ] 5.5 Run the test, expect PASS. Command: `pnpm vitest run packages/canvas/src/content/contentBlocks.test.ts`. Expected: `3 passed`.

- [ ] 5.6 Commit. Command:

```bash
git add packages/canvas/src/content/contentBlocks.ts packages/canvas/src/content/contentBlocks.test.ts packages/canvas/src/content/index.ts && git commit -m "feat(ws4): paragraphsToBlocks paste primitive"
```

---

## Task 6 — `imageBlock` (image path → block)

**Files:**
- Modify `packages/canvas/src/content/contentBlocks.ts` (append function)
- Modify `packages/canvas/src/content/contentBlocks.test.ts` (append describe)

**Interfaces:**
- Consumes: `BlockNoteBlock` (Task 2, already imported from `@research-canvas/exporter` at the top of `contentBlocks.ts` in Task 5 — no new import needed).
- Produces: `function imageBlock(url: string, caption?: string): BlockNoteBlock`

Builds a BlockNote image block whose `props.url` is the workspace-relative `assets/<graphNodeId>/<file>` path produced by the Rust image-import command (Task 13). Per §7, embedded images live in the body as image blocks referencing asset paths.

Steps:

- [ ] 6.1 Write the failing test. Append to `packages/canvas/src/content/contentBlocks.test.ts` (add `imageBlock` to the import) :

Change the import to:

```ts
import { imageBlock, paragraphsToBlocks } from "./contentBlocks";
```

Append:

```ts
describe("imageBlock", () => {
  it("builds an image block from a url with empty caption by default", () => {
    expect(imageBlock("assets/n1/cat.png")).toEqual({
      type: "image",
      props: { url: "assets/n1/cat.png", caption: "" },
    });
  });

  it("uses the provided caption", () => {
    expect(imageBlock("assets/n1/cat.png", "A cat")).toEqual({
      type: "image",
      props: { url: "assets/n1/cat.png", caption: "A cat" },
    });
  });
});
```

- [ ] 6.2 Run it, expect FAIL. Command: `pnpm vitest run packages/canvas/src/content/contentBlocks.test.ts`. Expected: `imageBlock is not a function`.

- [ ] 6.3 Minimal implementation. Append to `packages/canvas/src/content/contentBlocks.ts`:

```ts
export function imageBlock(url: string, caption = ""): BlockNoteBlock {
  return {
    type: "image",
    props: { url, caption },
  };
}
```

- [ ] 6.4 Run the test, expect PASS. Command: `pnpm vitest run packages/canvas/src/content/contentBlocks.test.ts`. Expected: `5 passed`.

- [ ] 6.5 Commit. Command:

```bash
git add packages/canvas/src/content/contentBlocks.ts packages/canvas/src/content/contentBlocks.test.ts && git commit -m "feat(ws4): imageBlock builder"
```

---

## Task 7 — `appendBlocksToBody` (splice new blocks into a body string)

**Files:**
- Modify `packages/canvas/src/content/contentBlocks.ts` (append function)
- Modify `packages/canvas/src/content/contentBlocks.test.ts` (append describe)

**Interfaces:**
- Consumes: `BlockNoteBlock` (Task 2, already imported from `@research-canvas/exporter` at the top of `contentBlocks.ts` in Task 5 — no new import needed).
- Produces: `function appendBlocksToBody(bodyJson: string, blocks: BlockNoteBlock[]): string`

Given a node's current `body` JSON string (which may be `""`/`"[]"`) and new blocks (from paste/drop), returns the new `body` JSON string with the blocks appended. This is the single mutation the store action passes to `updateGraphNode`'s `patch.body`.

Steps:

- [ ] 7.1 Write the failing test. Append to `packages/canvas/src/content/contentBlocks.test.ts` (add to import):

Change the import to:

```ts
import { appendBlocksToBody, imageBlock, paragraphsToBlocks } from "./contentBlocks";
```

Append:

```ts
describe("appendBlocksToBody", () => {
  it("appends to an empty body sentinel", () => {
    const result = appendBlocksToBody("[]", [
      { type: "paragraph", content: [{ type: "text", text: "hi" }] },
    ]);
    expect(JSON.parse(result)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "hi" }] },
    ]);
  });

  it("treats an empty string the same as the sentinel", () => {
    const result = appendBlocksToBody("", [imageBlock("assets/n/i.png")]);
    expect(JSON.parse(result)).toEqual([
      { type: "image", props: { url: "assets/n/i.png", caption: "" } },
    ]);
  });

  it("appends after existing blocks preserving order", () => {
    const existing = JSON.stringify([
      { type: "paragraph", content: [{ type: "text", text: "old" }] },
    ]);
    const result = appendBlocksToBody(existing, paragraphsToBlocks("new"));
    expect(JSON.parse(result)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "old" }] },
      { type: "paragraph", content: [{ type: "text", text: "new" }] },
    ]);
  });

  it("returns the original body when there are no new blocks", () => {
    const existing = JSON.stringify([
      { type: "paragraph", content: [{ type: "text", text: "old" }] },
    ]);
    expect(appendBlocksToBody(existing, [])).toBe(existing);
  });
});
```

- [ ] 7.2 Run it, expect FAIL. Command: `pnpm vitest run packages/canvas/src/content/contentBlocks.test.ts`. Expected: `appendBlocksToBody is not a function`.

- [ ] 7.3 Minimal implementation. Append to `packages/canvas/src/content/contentBlocks.ts`:

```ts
function parseBody(bodyJson: string): BlockNoteBlock[] {
  const trimmed = bodyJson.trim();
  if (trimmed === "" || trimmed === "[]") {
    return [];
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return Array.isArray(parsed) ? (parsed as BlockNoteBlock[]) : [];
  } catch {
    return [];
  }
}

export function appendBlocksToBody(bodyJson: string, blocks: BlockNoteBlock[]): string {
  if (blocks.length === 0) {
    return bodyJson;
  }
  const existing = parseBody(bodyJson);
  return JSON.stringify([...existing, ...blocks]);
}
```

- [ ] 7.4 Run the test, expect PASS. Command: `pnpm vitest run packages/canvas/src/content/contentBlocks.test.ts`. Expected: `9 passed`.

- [ ] 7.5 Commit. Command:

```bash
git add packages/canvas/src/content/contentBlocks.ts packages/canvas/src/content/contentBlocks.test.ts && git commit -m "feat(ws4): appendBlocksToBody splicer"
```

---

## Task 8 — `classifyPasteItems` / `classifyDropItems` (clipboard/DnD → intents)

**Files:**
- Create `packages/canvas/src/content/pasteIngest.ts`
- Create `packages/canvas/src/content/pasteIngest.test.ts`
- Modify `packages/canvas/src/content/index.ts` (add one re-export line)

**Interfaces:**
- Consumes: none (operates on plain data shapes mirroring `DataTransfer`).
- Produces:
  - `interface IngestItem { kind: "text" | "markdown" | "image"; mimeType: string }` and concrete variants:
    - `interface TextIngest extends IngestItem { kind: "text"; text: string }`
    - `interface MarkdownIngest extends IngestItem { kind: "markdown"; text: string; fileName: string }`
    - `interface ImageIngest extends IngestItem { kind: "image"; file: File; fileName: string }`
  - `type IngestResult = TextIngest | MarkdownIngest | ImageIngest`
  - `function classifyDropItems(input: { files: { name: string; type: string; file: File }[]; text: string }): IngestResult[]`
  - `function classifyPasteItems(input: { files: { name: string; type: string; file: File }[]; text: string }): IngestResult[]`

This classifies a paste/drop payload (decomposed to a plain shape so it is testable without a real `DataTransfer`): image files → `image`, `.md`/`text/markdown` files → `markdown` (read elsewhere), other text → `text`. `classifyPasteItems` and `classifyDropItems` share logic; they are exported separately so the UI can name them at call sites and so future divergence (e.g. paste preferring `text/html`) is non-breaking.

Steps:

- [ ] 8.1 Write the failing test. Create `packages/canvas/src/content/pasteIngest.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { classifyDropItems, classifyPasteItems } from "./pasteIngest";

function fakeFile(name: string, type: string): { name: string; type: string; file: File } {
  return { name, type, file: new File(["x"], name, { type }) };
}

describe("classifyDropItems", () => {
  it("classifies image files as image ingests", () => {
    const result = classifyDropItems({ files: [fakeFile("cat.png", "image/png")], text: "" });
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBe("image");
    expect(result[0].mimeType).toBe("image/png");
  });

  it("classifies markdown files by extension even when type is empty", () => {
    const result = classifyDropItems({ files: [fakeFile("notes.md", "")], text: "" });
    expect(result[0].kind).toBe("markdown");
    if (result[0].kind === "markdown") {
      expect(result[0].fileName).toBe("notes.md");
    }
  });

  it("classifies text/markdown mime as markdown", () => {
    const result = classifyDropItems({ files: [fakeFile("notes", "text/markdown")], text: "" });
    expect(result[0].kind).toBe("markdown");
  });

  it("falls back to dropped plain text when there are no files", () => {
    const result = classifyDropItems({ files: [], text: "hello world" });
    expect(result).toEqual([{ kind: "text", mimeType: "text/plain", text: "hello world" }]);
  });

  it("ignores empty text and empty files", () => {
    expect(classifyDropItems({ files: [], text: "   " })).toEqual([]);
  });
});

describe("classifyPasteItems", () => {
  it("uses the same classification as drop", () => {
    const files = [fakeFile("cat.png", "image/png")];
    expect(classifyPasteItems({ files, text: "" })).toEqual(
      classifyDropItems({ files, text: "" }),
    );
  });
});
```

- [ ] 8.2 Run it, expect FAIL. Command: `pnpm vitest run packages/canvas/src/content/pasteIngest.test.ts`. Expected: `Failed to resolve import "./pasteIngest"`.

- [ ] 8.3 Minimal implementation. Create `packages/canvas/src/content/pasteIngest.ts`:

```ts
export interface IngestItem {
  kind: "text" | "markdown" | "image";
  mimeType: string;
}

export interface TextIngest extends IngestItem {
  kind: "text";
  text: string;
}

export interface MarkdownIngest extends IngestItem {
  kind: "markdown";
  text: string;
  fileName: string;
}

export interface ImageIngest extends IngestItem {
  kind: "image";
  file: File;
  fileName: string;
}

export type IngestResult = TextIngest | MarkdownIngest | ImageIngest;

interface IngestInput {
  files: { name: string; type: string; file: File }[];
  text: string;
}

function isImage(type: string, name: string): boolean {
  if (type.startsWith("image/")) {
    return true;
  }
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(name);
}

function isMarkdown(type: string, name: string): boolean {
  if (type === "text/markdown") {
    return true;
  }
  return /\.(md|markdown|mdown|mkd)$/i.test(name);
}

function classify(input: IngestInput): IngestResult[] {
  const results: IngestResult[] = [];

  for (const entry of input.files) {
    if (isImage(entry.type, entry.name)) {
      results.push({
        kind: "image",
        mimeType: entry.type || "image/png",
        file: entry.file,
        fileName: entry.name,
      });
      continue;
    }
    if (isMarkdown(entry.type, entry.name)) {
      results.push({
        kind: "markdown",
        mimeType: entry.type || "text/markdown",
        text: "",
        fileName: entry.name,
      });
    }
  }

  if (results.length === 0 && input.text.trim().length > 0) {
    results.push({ kind: "text", mimeType: "text/plain", text: input.text });
  }

  return results;
}

export function classifyDropItems(input: IngestInput): IngestResult[] {
  return classify(input);
}

export function classifyPasteItems(input: IngestInput): IngestResult[] {
  return classify(input);
}
```

- [ ] 8.4 Re-export from the content barrel. In `packages/canvas/src/content/index.ts`, add:

```ts
export * from "./pasteIngest";
```

- [ ] 8.5 Run the test, expect PASS. Command: `pnpm vitest run packages/canvas/src/content/pasteIngest.test.ts`. Expected: `6 passed`.

- [ ] 8.6 Commit. Command:

```bash
git add packages/canvas/src/content/pasteIngest.ts packages/canvas/src/content/pasteIngest.test.ts packages/canvas/src/content/index.ts && git commit -m "feat(ws4): classify paste/drop items into ingest intents"
```

---

## Task 9 — Content/linking action factory: dependency surface + `addTextToNode`

**Files:**
- Create `packages/canvas/src/content/contentLinkingActions.ts`
- Create `packages/canvas/src/content/contentLinkingActions.test.ts`
- Modify `packages/canvas/src/content/index.ts` (add one re-export line)

**Interfaces:**
- Consumes (from `@research-canvas/desktop-api`, WS0 §5.1 / WS2 §5.2):
  - `GraphNode`, `GraphNodePatch`, `NewGraphNodeInput`, `GraphRelationship`
  - `updateGraphNode(input: { graphNodeId: string; patch: GraphNodePatch }): Promise<GraphNode>`
  - `readGraphNode(input: { graphNodeId: string }): Promise<GraphNode>`
  - `connectGraphNodes(input: { sourceGraphNodeId: string; targetGraphNodeId: string; relType: string; properties?: Record<string, unknown> }): Promise<GraphRelationship>`
  - `createGraphNode(input: NewGraphNodeInput): Promise<GraphNode>`
- Consumes (this workstream): `paragraphsToBlocks`, `appendBlocksToBody` (Tasks 5,7); `RelationshipKind`, `isRelationshipKind` (Task 1).
- Produces:
  - `interface ContentLinkingDeps { readGraphNode: ...; updateGraphNode: ...; connectGraphNodes: ...; createGraphNode: ...; importNodeImage: (input: { graphNodeId: string; sourceAbsolutePath: string }) => Promise<string> }`
  - `interface ContentLinkingActions { addTextToNode(...): Promise<GraphNode>; addImageToNode(...): Promise<GraphNode>; linkMarkdownFileToNode(...): Promise<GraphNode>; linkNodes(...): Promise<GraphRelationship> }`
  - `function createContentLinkingActions(deps: ContentLinkingDeps): ContentLinkingActions`

The factory takes the contract transport methods (so it is testable with fakes and free of Tauri/React) plus an `importNodeImage` callback (the Task-13 Rust command, surfaced through the store in Task 14). Defining the deps shape and the first action — `addTextToNode` — here; subsequent tasks add the other three actions to the same factory.

`addTextToNode(graphNodeId, text)`: read the node, append `paragraphsToBlocks(text)` to its body, call `updateGraphNode` with `{ body }`, return the updated node. Empty text is a no-op that still returns the current node (read once).

Steps:

- [ ] 9.1 Write the failing test. Create `packages/canvas/src/content/contentLinkingActions.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import type { GraphNode } from "@research-canvas/desktop-api";

import { createContentLinkingActions, type ContentLinkingDeps } from "./contentLinkingActions";

function makeNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    graphNodeId: "n1",
    entityType: "Dynamic",
    title: "Monopoly mechanism",
    body: "[]",
    summary: "",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    isTemporal: false,
    validFrom: null,
    validTo: null,
    temporalPrecision: null,
    createdAt: "2026-06-28T00:00:00Z",
    updatedAt: "2026-06-28T00:00:00Z",
    ...overrides,
  };
}

function makeDeps(node: GraphNode): {
  deps: ContentLinkingDeps;
  updateGraphNode: ReturnType<typeof vi.fn>;
} {
  const updateGraphNode = vi.fn(async (input: { graphNodeId: string; patch: { body?: string } }) =>
    makeNode({ graphNodeId: input.graphNodeId, body: input.patch.body ?? node.body }),
  );
  const deps: ContentLinkingDeps = {
    readGraphNode: vi.fn(async () => node),
    updateGraphNode,
    connectGraphNodes: vi.fn(async () => ({
      id: "r1",
      relType: "CAUSES",
      sourceGraphNodeId: "n1",
      targetGraphNodeId: "n2",
      properties: {},
    })),
    createGraphNode: vi.fn(async () => makeNode({ graphNodeId: "src1", entityType: "Source" })),
    importNodeImage: vi.fn(async () => "assets/n1/cat.png"),
  };
  return { deps, updateGraphNode };
}

describe("addTextToNode", () => {
  it("appends pasted text as paragraph blocks and persists the new body", async () => {
    const node = makeNode({ body: "[]" });
    const { deps, updateGraphNode } = makeDeps(node);
    const actions = createContentLinkingActions(deps);

    await actions.addTextToNode("n1", "line one\nline two");

    expect(updateGraphNode).toHaveBeenCalledTimes(1);
    const patchBody = updateGraphNode.mock.calls[0][0].patch.body as string;
    expect(JSON.parse(patchBody)).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "line one" }] },
      { type: "paragraph", content: [{ type: "text", text: "line two" }] },
    ]);
  });

  it("is a no-op persist for empty text but returns the node", async () => {
    const node = makeNode();
    const { deps, updateGraphNode } = makeDeps(node);
    const actions = createContentLinkingActions(deps);

    const result = await actions.addTextToNode("n1", "   ");

    expect(updateGraphNode).not.toHaveBeenCalled();
    expect(result.graphNodeId).toBe("n1");
  });
});
```

- [ ] 9.2 Run it, expect FAIL. Command: `pnpm vitest run packages/canvas/src/content/contentLinkingActions.test.ts`. Expected: `Failed to resolve import "./contentLinkingActions"`.

- [ ] 9.3 Minimal implementation. Create `packages/canvas/src/content/contentLinkingActions.ts`:

```ts
import type {
  GraphNode,
  GraphNodePatch,
  GraphRelationship,
  NewGraphNodeInput,
} from "@research-canvas/desktop-api";

import { appendBlocksToBody, paragraphsToBlocks } from "./contentBlocks";

export interface ContentLinkingDeps {
  readGraphNode: (input: { graphNodeId: string }) => Promise<GraphNode>;
  updateGraphNode: (input: { graphNodeId: string; patch: GraphNodePatch }) => Promise<GraphNode>;
  connectGraphNodes: (input: {
    sourceGraphNodeId: string;
    targetGraphNodeId: string;
    relType: string;
    properties?: Record<string, unknown>;
  }) => Promise<GraphRelationship>;
  createGraphNode: (input: NewGraphNodeInput) => Promise<GraphNode>;
  importNodeImage: (input: { graphNodeId: string; sourceAbsolutePath: string }) => Promise<string>;
}

export interface ContentLinkingActions {
  addTextToNode: (graphNodeId: string, text: string) => Promise<GraphNode>;
}

export function createContentLinkingActions(deps: ContentLinkingDeps): ContentLinkingActions {
  return {
    async addTextToNode(graphNodeId, text) {
      const node = await deps.readGraphNode({ graphNodeId });
      const blocks = paragraphsToBlocks(text);
      if (blocks.length === 0) {
        return node;
      }
      const body = appendBlocksToBody(node.body, blocks);
      return deps.updateGraphNode({ graphNodeId, patch: { body } });
    },
  };
}
```

- [ ] 9.4 Re-export from the content barrel. In `packages/canvas/src/content/index.ts`, add:

```ts
export * from "./contentLinkingActions";
```

- [ ] 9.5 Run the test, expect PASS. Command: `pnpm vitest run packages/canvas/src/content/contentLinkingActions.test.ts`. Expected: `2 passed`.

- [ ] 9.6 Commit. Command:

```bash
git add packages/canvas/src/content/contentLinkingActions.ts packages/canvas/src/content/contentLinkingActions.test.ts packages/canvas/src/content/index.ts && git commit -m "feat(ws4): content-linking action factory + addTextToNode"
```

---

## Task 10 — `addImageToNode` action

**Files:**
- Modify `packages/canvas/src/content/contentLinkingActions.ts` (extend interface + factory)
- Modify `packages/canvas/src/content/contentLinkingActions.test.ts` (append describe)

**Interfaces:**
- Consumes: `imageBlock`, `appendBlocksToBody` (Tasks 6,7); `ContentLinkingDeps.importNodeImage`, `ContentLinkingDeps.updateGraphNode` (Task 9).
- Produces: `addImageToNode(graphNodeId: string, sourceAbsolutePath: string, caption?: string): Promise<GraphNode>` on `ContentLinkingActions`.

`addImageToNode`: import the image via `deps.importNodeImage` (→ workspace-relative `assets/<graphNodeId>/<file>`), append an `imageBlock(url, caption)` to the body, persist with `updateGraphNode`.

Steps:

- [ ] 10.1 Write the failing test. Append to `packages/canvas/src/content/contentLinkingActions.test.ts`:

```ts
describe("addImageToNode", () => {
  it("imports the image and appends an image block referencing the returned path", async () => {
    const node = makeNode({ body: "[]" });
    const { deps, updateGraphNode } = makeDeps(node);
    const actions = createContentLinkingActions(deps);

    await actions.addImageToNode("n1", "/Users/me/Pictures/cat.png", "A cat");

    expect(deps.importNodeImage).toHaveBeenCalledWith({
      graphNodeId: "n1",
      sourceAbsolutePath: "/Users/me/Pictures/cat.png",
    });
    const patchBody = updateGraphNode.mock.calls[0][0].patch.body as string;
    expect(JSON.parse(patchBody)).toEqual([
      { type: "image", props: { url: "assets/n1/cat.png", caption: "A cat" } },
    ]);
  });
});
```

- [ ] 10.2 Run it, expect FAIL. Command: `pnpm vitest run packages/canvas/src/content/contentLinkingActions.test.ts`. Expected: `actions.addImageToNode is not a function`.

- [ ] 10.3 Minimal implementation. In `packages/canvas/src/content/contentLinkingActions.ts`:

Update the import line to add `imageBlock`:

```ts
import { appendBlocksToBody, imageBlock, paragraphsToBlocks } from "./contentBlocks";
```

Add to the `ContentLinkingActions` interface (after `addTextToNode`):

```ts
  addImageToNode: (
    graphNodeId: string,
    sourceAbsolutePath: string,
    caption?: string,
  ) => Promise<GraphNode>;
```

Add to the returned object in `createContentLinkingActions` (after `addTextToNode`):

```ts
    async addImageToNode(graphNodeId, sourceAbsolutePath, caption = "") {
      const url = await deps.importNodeImage({ graphNodeId, sourceAbsolutePath });
      const node = await deps.readGraphNode({ graphNodeId });
      const body = appendBlocksToBody(node.body, [imageBlock(url, caption)]);
      return deps.updateGraphNode({ graphNodeId, patch: { body } });
    },
```

- [ ] 10.4 Run the test, expect PASS. Command: `pnpm vitest run packages/canvas/src/content/contentLinkingActions.test.ts`. Expected: `3 passed`.

- [ ] 10.5 Commit. Command:

```bash
git add packages/canvas/src/content/contentLinkingActions.ts packages/canvas/src/content/contentLinkingActions.test.ts && git commit -m "feat(ws4): addImageToNode action"
```

---

## Task 11 — `linkMarkdownFileToNode` action (link a markdown file/source to a node)

**Files:**
- Modify `packages/canvas/src/content/contentLinkingActions.ts` (extend interface + factory)
- Modify `packages/canvas/src/content/contentLinkingActions.test.ts` (append describe)

**Interfaces:**
- Consumes: `markdownToBlockNoteJson` (Task 3, imported from `@research-canvas/exporter` — its single home is the exporter's `renderMarkdown.ts`); `appendBlocksToBody` (Task 7); `ContentLinkingDeps.createGraphNode`, `.connectGraphNodes`, `.updateGraphNode`, `.readGraphNode` (Task 9); `NewGraphNodeInput`, `GraphRelationship` (WS0 §5.1).
- Produces: `linkMarkdownFileToNode(input: { graphNodeId: string; fileName: string; markdown: string }): Promise<GraphNode>` on `ContentLinkingActions`.

This is the first-class "link a markdown file/source to a node" action (spec §5.4). It: (1) creates a `Source` graph node whose `body` is the file's markdown converted via `markdownToBlockNoteJson`, titled from the file name; (2) connects the target node to that Source with a `SOURCED_FROM` relationship; (3) appends a paragraph to the target body recording the link (so it is visible inline, not buried). Returns the updated target node. The created Source's `graphNodeId` is read off the `createGraphNode` result.

Steps:

- [ ] 11.1 Write the failing test. Append to `packages/canvas/src/content/contentLinkingActions.test.ts`:

```ts
describe("linkMarkdownFileToNode", () => {
  it("creates a Source node from the markdown and links target via SOURCED_FROM", async () => {
    const node = makeNode({ graphNodeId: "n1", body: "[]" });
    const { deps, updateGraphNode } = makeDeps(node);
    const createGraphNode = deps.createGraphNode as ReturnType<typeof vi.fn>;
    const connectGraphNodes = deps.connectGraphNodes as ReturnType<typeof vi.fn>;
    createGraphNode.mockResolvedValueOnce(
      makeNode({ graphNodeId: "src1", entityType: "Source", title: "notes.md" }),
    );
    const actions = createContentLinkingActions(deps);

    await actions.linkMarkdownFileToNode({
      graphNodeId: "n1",
      fileName: "notes.md",
      markdown: "# Heading\nbody text",
    });

    const createArg = createGraphNode.mock.calls[0][0];
    expect(createArg.entityType).toBe("Source");
    expect(createArg.title).toBe("notes.md");
    expect(JSON.parse(createArg.body)).toEqual([
      { type: "heading", props: { level: 1 }, content: [{ type: "text", text: "Heading" }] },
      { type: "paragraph", content: [{ type: "text", text: "body text" }] },
    ]);

    expect(connectGraphNodes).toHaveBeenCalledWith({
      sourceGraphNodeId: "n1",
      targetGraphNodeId: "src1",
      relType: "SOURCED_FROM",
    });

    expect(updateGraphNode).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] 11.2 Run it, expect FAIL. Command: `pnpm vitest run packages/canvas/src/content/contentLinkingActions.test.ts`. Expected: `actions.linkMarkdownFileToNode is not a function`.

- [ ] 11.3 Minimal implementation. In `packages/canvas/src/content/contentLinkingActions.ts`:

Update the imports to add the markdown converter (from its single home, `@research-canvas/exporter` — WS0 §7 — not a local `./blockNoteMarkdown`):

```ts
import { markdownToBlockNoteJson } from "@research-canvas/exporter";

import { appendBlocksToBody, imageBlock, paragraphsToBlocks } from "./contentBlocks";
```

Add to the `ContentLinkingActions` interface:

```ts
  linkMarkdownFileToNode: (input: {
    graphNodeId: string;
    fileName: string;
    markdown: string;
  }) => Promise<GraphNode>;
```

Add to the returned object in `createContentLinkingActions`:

```ts
    async linkMarkdownFileToNode({ graphNodeId, fileName, markdown }) {
      const source = await deps.createGraphNode({
        entityType: "Source",
        title: fileName,
        body: markdownToBlockNoteJson(markdown),
        isTemporal: false,
        sourceCoordinates: [],
      });
      await deps.connectGraphNodes({
        sourceGraphNodeId: graphNodeId,
        targetGraphNodeId: source.graphNodeId,
        relType: "SOURCED_FROM",
      });
      const node = await deps.readGraphNode({ graphNodeId });
      const body = appendBlocksToBody(node.body, [
        { type: "paragraph", content: [{ type: "text", text: `Linked source: ${fileName}` }] },
      ]);
      return deps.updateGraphNode({ graphNodeId, patch: { body } });
    },
```

- [ ] 11.4 Run the test, expect PASS. Command: `pnpm vitest run packages/canvas/src/content/contentLinkingActions.test.ts`. Expected: `4 passed`.

- [ ] 11.5 Commit. Command:

```bash
git add packages/canvas/src/content/contentLinkingActions.ts packages/canvas/src/content/contentLinkingActions.test.ts && git commit -m "feat(ws4): linkMarkdownFileToNode (SOURCED_FROM)"
```

---

## Task 12 — `linkNodes` action (node → node typed relationship)

**Files:**
- Modify `packages/canvas/src/content/contentLinkingActions.ts` (extend interface + factory)
- Modify `packages/canvas/src/content/contentLinkingActions.test.ts` (append describe)

**Interfaces:**
- Consumes: `isRelationshipKind`, `RelationshipKind` (Task 1); `ContentLinkingDeps.connectGraphNodes` (Task 9); `GraphRelationship` (WS0 §5.1).
- Produces: `linkNodes(input: { sourceGraphNodeId: string; targetGraphNodeId: string; kind: RelationshipKind; properties?: Record<string, unknown> }): Promise<GraphRelationship>` on `ContentLinkingActions`.

This is the first-class node→node linking action (spec §5.4) creating a typed relationship from the §4.3 set. It validates `kind` against the vocabulary (Task 1) — rejecting unknown kinds before any write — then delegates to `connectGraphNodes`, which writes to Neo4j via WS2's `GraphRepository::connect_nodes`.

**`kind` → `relType` mapping (load-bearing).** The action's public input names the relationship `kind: RelationshipKind` (the typed UI/vocabulary surface). The contract transport `connectGraphNodes` (WS0 §5.2 / WS2) names the same field **`relType: string`**. The `RelationshipKind` values are *identical* to the Neo4j SCREAMING_SNAKE relationship-type names (WS0 §2.3), so the mapping is a straight rename: pass `relType: kind` when calling the transport. Do **not** rename the transport field to `kind` — keep `relType` to match WS2; only the action's own input uses `kind`.

Steps:

- [ ] 12.1 Write the failing test. Append to `packages/canvas/src/content/contentLinkingActions.test.ts`:

```ts
describe("linkNodes", () => {
  it("creates a typed relationship through connectGraphNodes", async () => {
    const { deps } = makeDeps(makeNode());
    const connectGraphNodes = deps.connectGraphNodes as ReturnType<typeof vi.fn>;
    const actions = createContentLinkingActions(deps);

    await actions.linkNodes({
      sourceGraphNodeId: "n1",
      targetGraphNodeId: "n2",
      kind: "INSTANTIATES",
      properties: { dominance: "dominant" },
    });

    expect(connectGraphNodes).toHaveBeenCalledWith({
      sourceGraphNodeId: "n1",
      targetGraphNodeId: "n2",
      relType: "INSTANTIATES",
      properties: { dominance: "dominant" },
    });
  });

  it("rejects an unknown relationship kind before any write", async () => {
    const { deps } = makeDeps(makeNode());
    const connectGraphNodes = deps.connectGraphNodes as ReturnType<typeof vi.fn>;
    const actions = createContentLinkingActions(deps);

    await expect(
      actions.linkNodes({
        sourceGraphNodeId: "n1",
        targetGraphNodeId: "n2",
        // @ts-expect-error intentionally invalid to test the runtime guard
        kind: "RELATES",
      }),
    ).rejects.toThrow(/unknown relationship kind/i);
    expect(connectGraphNodes).not.toHaveBeenCalled();
  });
});
```

- [ ] 12.2 Run it, expect FAIL. Command: `pnpm vitest run packages/canvas/src/content/contentLinkingActions.test.ts`. Expected: `actions.linkNodes is not a function`.

- [ ] 12.3 Minimal implementation. In `packages/canvas/src/content/contentLinkingActions.ts`:

Add the vocabulary import:

```ts
import { isRelationshipKind, type RelationshipKind } from "./relationshipKinds";
```

Add to the `ContentLinkingActions` interface:

```ts
  linkNodes: (input: {
    sourceGraphNodeId: string;
    targetGraphNodeId: string;
    kind: RelationshipKind;
    properties?: Record<string, unknown>;
  }) => Promise<GraphRelationship>;
```

Add to the returned object in `createContentLinkingActions`:

```ts
    async linkNodes({ sourceGraphNodeId, targetGraphNodeId, kind, properties }) {
      if (!isRelationshipKind(kind)) {
        throw new Error(`unknown relationship kind: ${String(kind)}`);
      }
      return deps.connectGraphNodes({
        sourceGraphNodeId,
        targetGraphNodeId,
        // map the typed `kind` to the transport's `relType` field (WS0 §5.2 / WS2);
        // RelationshipKind values are the Neo4j SCREAMING_SNAKE rel-type names verbatim.
        relType: kind,
        ...(properties === undefined ? {} : { properties }),
      });
    },
```

- [ ] 12.4 Run the test, expect PASS. Command: `pnpm vitest run packages/canvas/src/content/contentLinkingActions.test.ts`. Expected: `6 passed`.

- [ ] 12.5 Type-check + full content-suite run. Commands: `pnpm exec tsc -b` (expect exit 0) then `pnpm vitest run packages/canvas/src/content packages/exporter/src/renderMarkdown.test.ts` (expect all passing — the canvas content tests `relationshipKinds`, `contentBlocks`, `pasteIngest`, `contentLinkingActions`, plus the exporter's `renderMarkdown` converter tests from Tasks 2–4).

- [ ] 12.6 Commit. Command:

```bash
git add packages/canvas/src/content/contentLinkingActions.ts packages/canvas/src/content/contentLinkingActions.test.ts && git commit -m "feat(ws4): linkNodes typed node→node relationship action"
```

---

## Task 13 — Rust `import_node_image_command` (copy external image into per-node assets)

**Files:**
- Create `apps/desktop/src-tauri/src/commands/assets.rs`
- Modify `apps/desktop/src-tauri/src/commands/mod.rs` (add `pub mod assets;` — confirm the file lists existing modules; if `commands/mod.rs` does not exist, the modules are declared in `lib.rs` via `mod commands { ... }` or `pub mod commands;` — in that case add `pub mod assets;` next to the existing `pub mod projects;` declaration)
- Modify `apps/desktop/src-tauri/src/lib.rs` (register the command in the `generate_handler!` macro, after line 62 `commands::projects::read_workspace_text_file_command,`)

**Interfaces:**
- Consumes: nothing from other workstreams (pure filesystem + workspace-root resolution; mirrors the existing `read_workspace_text_file_command` pattern in `commands/projects.rs`).
- Produces:
  - Tauri command `import_node_image_command(request: ImportNodeImageRequest) -> Result<String, String>` where `ImportNodeImageRequest { workspace_root: String, graph_node_id: String, source_absolute_path: String }`, returning the **workspace-relative** path `assets/<graph_node_id>/<file>` (forward slashes), with the file copied to `<workspace_root>/assets/<graph_node_id>/<file>`.
  - Pure helper `compute_node_asset_relative_path(graph_node_id: &str, source_file_name: &str) -> String` (unit-tested without filesystem).

This is the desktop side of `addImageToNode`'s `importNodeImage` dependency. The TS transport method added in Task 14 (`importNodeImage`) invokes this command. The returned relative path is exactly what `imageBlock` (Task 6) stores in `props.url`, and the static exporter (WS7) copies under `assets/`.

Steps:

- [ ] 13.1 Write the failing unit test (pure helper) + integration test (real temp fs). Create `apps/desktop/src-tauri/src/commands/assets.rs` initially containing ONLY the tests so the module fails to compile (drives the impl):

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn computes_forward_slash_relative_path_under_node_folder() {
        let rel = compute_node_asset_relative_path("n1", "cat.png");
        assert_eq!(rel, "assets/n1/cat.png");
    }

    #[test]
    fn strips_directory_components_from_source_file_name() {
        let rel = compute_node_asset_relative_path("n1", "weird/../cat.png");
        assert_eq!(rel, "assets/n1/cat.png");
    }

    #[test]
    fn imports_file_into_workspace_assets_and_returns_relative_path() {
        let temp = std::env::temp_dir().join(format!("ws4-assets-{}", std::process::id()));
        let workspace = temp.join("workspace");
        let source_dir = temp.join("src");
        fs::create_dir_all(&workspace).unwrap();
        fs::create_dir_all(&source_dir).unwrap();
        let source = source_dir.join("cat.png");
        fs::write(&source, b"PNGDATA").unwrap();

        let request = ImportNodeImageRequest {
            workspace_root: workspace.to_string_lossy().to_string(),
            graph_node_id: "n1".to_string(),
            source_absolute_path: source.to_string_lossy().to_string(),
        };

        let rel = import_node_image(request).unwrap();
        assert_eq!(rel, "assets/n1/cat.png");

        let copied = workspace.join("assets").join("n1").join("cat.png");
        assert_eq!(fs::read(&copied).unwrap(), b"PNGDATA");

        fs::remove_dir_all(&temp).ok();
    }

    #[test]
    fn errors_when_source_file_missing() {
        let temp = std::env::temp_dir().join(format!("ws4-assets-missing-{}", std::process::id()));
        let workspace = temp.join("workspace");
        fs::create_dir_all(&workspace).unwrap();

        let request = ImportNodeImageRequest {
            workspace_root: workspace.to_string_lossy().to_string(),
            graph_node_id: "n1".to_string(),
            source_absolute_path: workspace.join("does-not-exist.png").to_string_lossy().to_string(),
        };

        assert!(import_node_image(request).is_err());
        fs::remove_dir_all(&temp).ok();
    }
}
```

- [ ] 13.2 Wire the module so the test is discovered, then run it and expect a COMPILE failure. In `apps/desktop/src-tauri/src/lib.rs`, find the `commands` module declarations (the lines reading `commands::projects::...` confirm a `commands` module exists). Add the module declaration next to the other command modules. If `lib.rs` contains `pub mod commands;`, instead add to `apps/desktop/src-tauri/src/commands/mod.rs` the line:

```rust
pub mod assets;
```

If there is no `commands/mod.rs` (modules declared inline in `lib.rs`), add `pub mod assets;` to that inline `mod commands { ... }` block. Then run:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml assets -- --test-threads=1
```

Expected: compile error `cannot find function 'compute_node_asset_relative_path'` / `cannot find type 'ImportNodeImageRequest'` (the test references symbols not yet defined).

- [ ] 13.3 Minimal implementation. Prepend to `apps/desktop/src-tauri/src/commands/assets.rs` (above the `#[cfg(test)]` block):

```rust
use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportNodeImageRequest {
    pub workspace_root: String,
    pub graph_node_id: String,
    pub source_absolute_path: String,
}

/// Build the workspace-relative asset path `assets/<graph_node_id>/<file>` using
/// only the final file-name component of the source (directory parts stripped),
/// always with forward slashes.
pub fn compute_node_asset_relative_path(graph_node_id: &str, source_file_name: &str) -> String {
    let file_name = Path::new(source_file_name)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("file");
    format!("assets/{graph_node_id}/{file_name}")
}

/// Copy an external image into `<workspace_root>/assets/<graph_node_id>/<file>` and
/// return the workspace-relative path. Errors are returned as strings (Tauri command shape).
pub fn import_node_image(request: ImportNodeImageRequest) -> Result<String, String> {
    let source = Path::new(&request.source_absolute_path);
    let file_name = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "source path has no file name".to_string())?;

    let relative = compute_node_asset_relative_path(&request.graph_node_id, file_name);

    let target = Path::new(&request.workspace_root)
        .join("assets")
        .join(&request.graph_node_id)
        .join(file_name);

    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    fs::copy(source, &target).map_err(|error| error.to_string())?;

    Ok(relative)
}

#[tauri::command]
pub fn import_node_image_command(request: ImportNodeImageRequest) -> Result<String, String> {
    import_node_image(request)
}
```

- [ ] 13.4 Run the Rust tests, expect PASS. Command:

```bash
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml assets -- --test-threads=1
```

Expected: `test result: ok. 4 passed`.

- [ ] 13.5 Register the command in the handler. In `apps/desktop/src-tauri/src/lib.rs`, inside `tauri::generate_handler![ ... ]`, add this line immediately after `commands::projects::read_workspace_text_file_command,`:

```rust
            commands::assets::import_node_image_command,
```

- [ ] 13.6 Confirm the whole backend compiles. Command:

```bash
cargo build --manifest-path apps/desktop/src-tauri/Cargo.toml
```

Expected: `Finished` with no errors (warnings acceptable).

- [ ] 13.7 Commit. Command:

```bash
git add apps/desktop/src-tauri/src/commands/assets.rs apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/src/commands/mod.rs && git commit -m "feat(ws4): import_node_image_command copies image into per-node assets"
```

(If `commands/mod.rs` does not exist in this repo, omit it from the `git add`; the module declaration lives in `lib.rs`, already staged.)

---

## Task 14 — `importNodeImage` transport method + UI affordances

**Files:**
- Modify `packages/desktop-api/src/index.ts` (add `importNodeImage` to `WorkspaceTransport`, implement in both transports)
- Create `apps/desktop/src/features/canvas/NodeContentDropSurface.tsx`
- Create `apps/desktop/src/features/canvas/LinkFilePicker.tsx`
- Create `apps/desktop/src/features/canvas/LinkNodePicker.tsx`
- Modify `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx` (expose `contentLinkingActions` on the context value)

**Interfaces:**
- Consumes:
  - `createContentLinkingActions`, `ContentLinkingDeps`, `ContentLinkingActions` (Tasks 9–12); `classifyDropItems`, `classifyPasteItems` (Task 8); `RELATIONSHIP_KINDS`, `RelationshipKind` (Task 1).
  - From `WorkspaceTransport` (WS2 §5.2): `readGraphNode`, `updateGraphNode`, `connectGraphNodes`, `createGraphNode`, `searchGraph`.
  - Existing context: `useCanvasWorkspace()` (`CanvasWorkspaceContext.tsx`), `transport` (created via `createWorkspaceTransport()` at `CanvasWorkspaceContext.tsx:109`), `workingRoot` (the workspace root, used as `workspace_root` for image import; `CanvasWorkspaceContext.tsx:124`).
- Produces:
  - `WorkspaceTransport.importNodeImage(input: { workspaceRoot: string; graphNodeId: string; sourceAbsolutePath: string }): Promise<string>` (Tauri only; browser-bridge throws "read-only web build").
  - `CanvasWorkspaceContextValue.contentLinkingActions: ContentLinkingActions`
  - React components `NodeContentDropSurface`, `LinkFilePicker`, `LinkNodePicker`.

This wires the pure logic to the live transport and mounts the affordances on the WS3 node-document view. The drop surface and pickers are deliberately inline/first-class (spec §5.4: "not buried in menus").

Steps:

- [ ] 14.1 Write a failing transport test for `importNodeImage`. Append to `packages/desktop-api/src/index.test.ts` a test that the browser-bridge transport rejects `importNodeImage` (read-only enforcement, §5.3):

```ts
import { describe, expect, it } from "vitest";

import { createWorkspaceTransport } from "./index";

describe("importNodeImage transport", () => {
  it("rejects in the non-Tauri (read-only web) build", async () => {
    const transport = createWorkspaceTransport();
    await expect(
      transport.importNodeImage({
        workspaceRoot: "/ws",
        graphNodeId: "n1",
        sourceAbsolutePath: "/x/cat.png",
      }),
    ).rejects.toThrow(/read-only web build/i);
  });
});
```

- [ ] 14.2 Run it, expect FAIL. Command: `pnpm vitest run packages/desktop-api/src/index.test.ts`. Expected: failure `transport.importNodeImage is not a function`.

- [ ] 14.3 Add `importNodeImage` to the `WorkspaceTransport` interface in `packages/desktop-api/src/index.ts`. Add this member inside `interface WorkspaceTransport { ... }` (e.g. directly before the closing brace at line 165):

```ts
  importNodeImage(input: {
    workspaceRoot: string;
    graphNodeId: string;
    sourceAbsolutePath: string;
  }): Promise<string>;
```

- [ ] 14.4 Implement in the Tauri transport. In `createTauriWorkspaceTransport()` (before its closing `};` at line 258), add:

```ts
    async importNodeImage(input) {
      return invokeTauri<string>("import_node_image_command", {
        request: {
          workspaceRoot: input.workspaceRoot,
          graphNodeId: input.graphNodeId,
          sourceAbsolutePath: input.sourceAbsolutePath,
        },
      });
    },
```

- [ ] 14.5 Implement in the browser-bridge transport (read-only: throw). In `createBrowserBridgeTransport()` (before its closing `};` at line 358), add:

```ts
    async importNodeImage() {
      throw new Error("read-only web build");
    },
```

- [ ] 14.6 Run the transport test, expect PASS. Command: `pnpm vitest run packages/desktop-api/src/index.test.ts`. Expected: all existing tests plus the new one pass.

- [ ] 14.7 Expose `contentLinkingActions` on the canvas context. In `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx`:

Add the import (near the other `@research-canvas/canvas` import at line 17):

```ts
import {
  createContentLinkingActions,
  type ContentLinkingActions,
} from "@research-canvas/canvas";
```

Add to the `CanvasWorkspaceContextValue` interface (after `captureViewport: () => Viewport;` at line 96):

```ts
  contentLinkingActions: ContentLinkingActions;
```

Build the actions with `useMemo` inside `CanvasWorkspaceProvider` (after `const transport = useMemo(...)` at line 109). Use `workingRoot` for the image-import workspace root:

```ts
  const contentLinkingActions = useMemo<ContentLinkingActions>(
    () =>
      createContentLinkingActions({
        readGraphNode: (input) => transport.readGraphNode(input),
        updateGraphNode: (input) => transport.updateGraphNode(input),
        connectGraphNodes: (input) => transport.connectGraphNodes(input),
        createGraphNode: (input) => transport.createGraphNode(input),
        importNodeImage: (input) =>
          transport.importNodeImage({
            workspaceRoot: workingRoot ?? "",
            graphNodeId: input.graphNodeId,
            sourceAbsolutePath: input.sourceAbsolutePath,
          }),
      }),
    [transport, workingRoot],
  );
```

Add `contentLinkingActions` to the `contextValue` object (after `captureViewport`/`registerCaptureViewport` entries near line 584) and to its `useMemo` dependency array (the array starting near line 586):

```ts
      contentLinkingActions,
```

and append `contentLinkingActions` to the dependency array list.

- [ ] 14.8 Create the drop/paste surface. Create `apps/desktop/src/features/canvas/NodeContentDropSurface.tsx`:

```tsx
import { useCallback, useState, type DragEvent, type ClipboardEvent, type ReactNode } from "react";

import {
  classifyDropItems,
  classifyPasteItems,
  type IngestResult,
} from "@research-canvas/canvas";

import { useCanvasWorkspace } from "./CanvasWorkspaceContext";

interface NodeContentDropSurfaceProps {
  graphNodeId: string;
  children: ReactNode;
}

function toFileShapes(list: FileList | null): { name: string; type: string; file: File }[] {
  if (!list) {
    return [];
  }
  return Array.from(list).map((file) => ({ name: file.name, type: file.type, file }));
}

async function ingest(
  graphNodeId: string,
  items: IngestResult[],
  actions: ReturnType<typeof useCanvasWorkspace>["contentLinkingActions"],
) {
  for (const item of items) {
    if (item.kind === "text") {
      await actions.addTextToNode(graphNodeId, item.text);
    } else if (item.kind === "markdown") {
      const markdown = await item.file.text();
      await actions.linkMarkdownFileToNode({ graphNodeId, fileName: item.fileName, markdown });
    } else {
      const path = (item.file as File & { path?: string }).path;
      if (path) {
        await actions.addImageToNode(graphNodeId, path);
      }
    }
  }
}

export function NodeContentDropSurface({ graphNodeId, children }: NodeContentDropSurfaceProps) {
  const workspace = useCanvasWorkspace();
  const [active, setActive] = useState(false);

  const onDrop = useCallback(
    async (event: DragEvent) => {
      event.preventDefault();
      setActive(false);
      const items = classifyDropItems({
        files: toFileShapes(event.dataTransfer.files),
        text: event.dataTransfer.getData("text/plain"),
      });
      await ingest(graphNodeId, items, workspace.contentLinkingActions);
    },
    [graphNodeId, workspace.contentLinkingActions],
  );

  const onPaste = useCallback(
    async (event: ClipboardEvent) => {
      const items = classifyPasteItems({
        files: toFileShapes(event.clipboardData.files),
        text: event.clipboardData.getData("text/plain"),
      });
      if (items.length > 0) {
        event.preventDefault();
        await ingest(graphNodeId, items, workspace.contentLinkingActions);
      }
    },
    [graphNodeId, workspace.contentLinkingActions],
  );

  return (
    <div
      className="node-content-drop-surface"
      data-active={active ? "true" : "false"}
      onDragOver={(event) => {
        event.preventDefault();
        setActive(true);
      }}
      onDragLeave={() => setActive(false)}
      onDrop={(event) => void onDrop(event)}
      onPaste={(event) => void onPaste(event)}
    >
      {children}
    </div>
  );
}
```

- [ ] 14.9 Create the "Link a file…" picker. Create `apps/desktop/src/features/canvas/LinkFilePicker.tsx`:

```tsx
import { useCallback, useState } from "react";

import { FuzzyFilePicker } from "@research-canvas/canvas";

import { useCanvasWorkspace } from "./CanvasWorkspaceContext";

interface LinkFilePickerProps {
  graphNodeId: string;
}

export function LinkFilePicker({ graphNodeId }: LinkFilePickerProps) {
  const workspace = useCanvasWorkspace();
  const [open, setOpen] = useState(false);

  const markdownEntries = workspace.entries
    .filter((entry) => !entry.isDirectory && entry.kind === "markdown")
    .map((entry) => ({ name: entry.name, path: entry.absolutePath, kind: entry.kind }));

  const linkSelected = useCallback(
    async (path: string, name: string) => {
      setOpen(false);
      const markdown = await workspace.transport.readWorkspaceTextFile?.(path) ?? "";
      await workspace.contentLinkingActions.linkMarkdownFileToNode({
        graphNodeId,
        fileName: name,
        markdown,
      });
    },
    [graphNodeId, workspace.contentLinkingActions, workspace.transport],
  );

  return (
    <div className="link-file-picker">
      <button className="link-file-picker__trigger" onClick={() => setOpen(true)}>
        Link a file…
      </button>
      {open && (
        <FuzzyFilePicker
          anchorX={0}
          anchorY={0}
          entries={markdownEntries}
          onClose={() => setOpen(false)}
          onSelect={(entry) => void linkSelected(entry.path, entry.name)}
        />
      )}
    </div>
  );
}
```

Note: `readWorkspaceTextFile` is the existing exported helper in `@research-canvas/desktop-api` (`packages/desktop-api/src/index.ts:181`). If `transport.readWorkspaceTextFile` is not on the transport object, import the standalone `readWorkspaceTextFile` from `@research-canvas/desktop-api` and call it directly instead of `workspace.transport.readWorkspaceTextFile`:

```tsx
import { readWorkspaceTextFile } from "@research-canvas/desktop-api";
// ...
const markdown = await readWorkspaceTextFile(path);
```

Use the standalone-import form to avoid relying on the transport carrying the method.

- [ ] 14.10 Create the node→node "Link to…" picker. Create `apps/desktop/src/features/canvas/LinkNodePicker.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";

import {
  RELATIONSHIP_KINDS,
  type RelationshipKind,
} from "@research-canvas/canvas";
import type { GraphNode } from "@research-canvas/desktop-api";

import { useCanvasWorkspace } from "./CanvasWorkspaceContext";

interface LinkNodePickerProps {
  sourceGraphNodeId: string;
}

export function LinkNodePicker({ sourceGraphNodeId }: LinkNodePickerProps) {
  const workspace = useCanvasWorkspace();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GraphNode[]>([]);
  const [kind, setKind] = useState<RelationshipKind>("INSTANTIATES");

  useEffect(() => {
    let cancelled = false;
    if (query.trim().length === 0) {
      setResults([]);
      return;
    }
    void workspace.transport.searchGraph({ query, limit: 10 }).then((hits) => {
      if (!cancelled) {
        setResults(hits.filter((hit) => hit.graphNodeId !== sourceGraphNodeId));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [query, sourceGraphNodeId, workspace.transport]);

  const link = useCallback(
    async (targetGraphNodeId: string) => {
      await workspace.contentLinkingActions.linkNodes({
        sourceGraphNodeId,
        targetGraphNodeId,
        kind,
      });
      setQuery("");
      setResults([]);
    },
    [kind, sourceGraphNodeId, workspace.contentLinkingActions],
  );

  return (
    <div className="link-node-picker">
      <select
        className="link-node-picker__kind"
        value={kind}
        onChange={(event) => setKind(event.target.value as RelationshipKind)}
      >
        {RELATIONSHIP_KINDS.map((option) => (
          <option key={option.kind} value={option.kind} title={option.description}>
            {option.label}
          </option>
        ))}
      </select>
      <input
        className="link-node-picker__query"
        placeholder="Link to…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <ul className="link-node-picker__results">
        {results.map((node) => (
          <li key={node.graphNodeId}>
            <button onClick={() => void link(node.graphNodeId)}>{node.title}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Note: `LinkNodePicker` reads `workspace.transport`. The current `CanvasWorkspaceContextValue` does not expose `transport`. Add `transport` to the context value: in `CanvasWorkspaceContext.tsx`, add `transport: ReturnType<typeof createWorkspaceTransport>;` to the `CanvasWorkspaceContextValue` interface, include `transport` in the `contextValue` object, and append `transport` to that object's `useMemo` dependency array. (This mirrors how `contentLinkingActions` is added in step 14.7.)

- [ ] 14.11 Type-check the workspace. Command: `pnpm exec tsc -b`. Expected: exits 0. If `tsc` reports that `transport.readGraphNode`/`updateGraphNode`/`connectGraphNodes`/`createGraphNode`/`searchGraph` do not exist, those are WS2's contract methods (§5.2); add them to the `WorkspaceTransport` interface and both transport implementations exactly as listed in WS0 §5.2 (Tauri: `invokeTauri<T>("<name>_command", { input })`; browser-bridge: read methods via `requestJsonWithRetry`, write methods `throw new Error("read-only web build")`). Re-run `pnpm exec tsc -b` until it exits 0.

- [ ] 14.12 Run the full frontend suite. Command: `pnpm vitest run`. Expected: all tests pass (no regressions; the new content tests and the transport test included).

- [ ] 14.13 Commit. Command:

```bash
git add packages/desktop-api/src/index.ts packages/desktop-api/src/index.test.ts apps/desktop/src/features/canvas/NodeContentDropSurface.tsx apps/desktop/src/features/canvas/LinkFilePicker.tsx apps/desktop/src/features/canvas/LinkNodePicker.tsx apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx && git commit -m "feat(ws4): importNodeImage transport + drop surface, file picker, node-link picker"
```

---

## Done When

- [ ] `RELATIONSHIP_KINDS` enumerates exactly the nine spec relationship kinds (`INSTANTIATES`, `ECHOES`, `CAUSES`, `INFLUENCES`, `OPPOSES`, `INHERITS`, `TRANSFORMS_INTO`, `LOCATED_AT`, `SOURCED_FROM`, `RESONATES_WITH`) and `isRelationshipKind` guards them (Task 1).
- [ ] `blockNoteJsonToMarkdown` and `markdownToBlockNoteJson` exist with the WS0 §7 signatures and round-trip a representative document stably (Tasks 2–4).
- [ ] Pasted plain text becomes paragraph blocks; an imported image becomes an image block whose `props.url` is the per-node `assets/<graphNodeId>/<file>` path; both splice into a node body via `appendBlocksToBody` (Tasks 5–7).
- [ ] A paste/drop payload is classified into text/markdown/image ingest intents (Task 8).
- [ ] `createContentLinkingActions` exposes `addTextToNode`, `addImageToNode`, `linkMarkdownFileToNode` (creates a `Source` node + `SOURCED_FROM` relationship), and `linkNodes` (typed node→node relationship validated against the vocabulary), each driven only through the contract `WorkspaceTransport` methods (Tasks 9–12).
- [ ] `import_node_image_command` copies an external image into `<workspace_root>/assets/<graph_node_id>/<file>` and returns the workspace-relative path; it is registered in `lib.rs` `generate_handler!` and covered by passing Rust tests run with `--test-threads=1` (Task 13).
- [ ] `WorkspaceTransport.importNodeImage` is implemented (Tauri) and throws "read-only web build" in the browser-bridge build (Task 14).
- [ ] The canvas context exposes `contentLinkingActions`; `NodeContentDropSurface`, `LinkFilePicker`, and `LinkNodePicker` are mounted as inline, first-class affordances (not buried in menus) on the node-document view (Task 14).
- [ ] `pnpm exec tsc -b` exits 0, `pnpm vitest run` passes, and `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -- --test-threads=1` passes.
