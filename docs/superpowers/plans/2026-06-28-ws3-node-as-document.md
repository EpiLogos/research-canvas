# Node-as-Document (BlockNote rich-text full page) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a graph node open into a full Notion-style rich-text page powered by BlockNote (slash menu, drag handles, native image blocks). The page reads its body from the Neo4j theory node (`GraphNode.body`, a BlockNote/ProseMirror JSON string) and writes edits back to the same node through `WorkspaceTransport.updateGraphNode`, debounced and transactional with the same robustness bar as WS1 (errors surfaced, never swallowed). A compact canvas/timeline node (title + optional thumbnail) expands to the full page and back; the page also exports its body to Markdown for the static web layer and linked-resource interop.

**Architecture:** A new workspace package `@research-canvas/node-document` holds the framework-agnostic document model (BlockNote JSON helpers + a Zustand v5 vanilla store that owns one node's body, dirty-tracking and debounced flush). A new viewer component `BlockNoteDocument` (in `packages/viewers`) renders/edits the body with BlockNote's React editor. The desktop app surfaces it in two places that already exist: the right-panel **Content** tab (`ContentTab` → `NodeContentPane`) and the **FullScreenReader** node mode. Both fetch the `GraphNode` via the WS2 transport method `readGraphNode` and persist via `updateGraphNode`. The Markdown export function `blockNoteJsonToMarkdown` (and its inverse) lives in `packages/exporter` per WS0 §7. No code parses or rewrites the body except through this package.

**Tech Stack:** Tauri v2; React 19 + Vite 7 + TypeScript 5.9; pnpm monorepo; XYFlow @xyflow/react v12.8.5; Zustand v5 vanilla stores; BlockNote (`@blocknote/core`, `@blocknote/react`, `@blocknote/mantine`) for the editor; Vitest 3 + @testing-library/react for frontend tests.

## Global Constraints

Tauri v2; React 19 + Vite 7 + TypeScript 5.9; pnpm monorepo; XYFlow @xyflow/react v12.8.5; Zustand v5 vanilla stores; test-first (TDD) for every backend repository, frontend state model, and export behavior; prefer REAL integration tests (real SQLite in temp dir, real Neo4j against an ephemeral/docker instance, real fixture filesystem) over mocks; ALWAYS run Rust tests with `--test-threads=1`; keep file/folder/package names per the repo's existing conventions.

---

## Workstream dependencies (read once)

This plan **consumes** the following from the WS0 contracts doc (`docs/superpowers/plans/2026-06-28-ws0-contracts-and-architecture.md`) and from WS2 (Neo4j data layer), which must be implemented first:

- **WS0 §5.1 TS types** (defined in `packages/desktop-api/src/index.ts`):
  - `interface GraphNode { graphNodeId: string; entityType: EntityType; title: string; body: string; summary: string; archetypalResonance: string | null; coordinate: string | null; sourceCoordinates: string[]; isTemporal: boolean; validFrom: string | null; validTo: string | null; temporalPrecision: "year"|"month"|"day"|"decade"|"century"|"millennium"|null; createdAt: string; updatedAt: string; }`
  - `type GraphNodePatch = Partial<Pick<GraphNode, "title"|"body"|"summary"|"archetypalResonance"|"coordinate"|"sourceCoordinates"|"isTemporal"|"validFrom"|"validTo"|"temporalPrecision">>`
- **WS0 §5.2 transport methods** (added to `WorkspaceTransport` in `packages/desktop-api/src/index.ts` by WS2):
  - `readGraphNode(input: { graphNodeId: string }): Promise<GraphNode>`
  - `updateGraphNode(input: { graphNodeId: string; patch: GraphNodePatch }): Promise<GraphNode>` (desktop only; the browser-bridge transport throws `new Error("read-only web build")`)
- **WS0 §7 body format:** body is BlockNote document JSON serialized to a **string**; empty doc is the literal string `"[]"`; frontend treats `""` and `"[]"` as empty.
- **WS0 §7 markdown export contract** (this plan **produces** it in `packages/exporter/src/renderMarkdown.ts`):
  - `export function blockNoteJsonToMarkdown(bodyJson: string): string`
  - `export function markdownToBlockNoteJson(markdown: string): string`

If WS2 has not yet added `GraphNode`/`GraphNodePatch`/`readGraphNode`/`updateGraphNode`, Task 5 below cannot type-check. The earlier tasks (1–4, 4A, 6–9) are independent of WS2 and can be built first; Task 10–12 wire the desktop UI and require WS2's transport methods to exist. Each task's **Interfaces → Consumes** block names exactly what it needs.

This plan **produces** (for WS4 frictionless content/linking and WS7 web read-layer to consume):

- `@research-canvas/node-document` package exporting:
  - `EMPTY_BLOCKNOTE_DOC: string` (`"[]"`)
  - `isEmptyBlockNoteBody(body: string): boolean`
  - `normaliseBlockNoteBody(body: string): string`
  - `blockNoteSummary(body: string, maxChars?: number): string`
  - `createNodeDocumentStore(input: { graphNodeId: string; initialBody: string; flush: (body: string, summary: string) => Promise<void>; debounceMs?: number }): NodeDocumentStore`
  - `type NodeDocumentStore` / `interface NodeDocumentState`
- `packages/viewers` exporting `BlockNoteDocument` (React component) and `BlockNoteReadOnly` (React component).
- `packages/exporter` exporting `blockNoteJsonToMarkdown` and `markdownToBlockNoteJson`.

> **Cross-workstream ownership of the markdown bridge (READ — single producer rule).** WS3 is the **single producer** of `blockNoteJsonToMarkdown` and `markdownToBlockNoteJson`, defined exactly once in `packages/exporter/src/renderMarkdown.ts` and re-exported from `@research-canvas/exporter` (WS0 §7). No other workstream may define, copy, or shadow these functions:
> - **WS7 (web read-layer)** MUST `import { blockNoteJsonToMarkdown } from "@research-canvas/exporter"` and consume it — it MUST NOT redefine its own body-to-markdown converter. (If WS7 lands first and has already added these exports to `renderMarkdown.ts`, that is harmless: Task 6/7 below grep the file and skip creation when the export already exists, so WS3 never duplicates them.)
> - **WS4 (content/linking)** MUST import `blockNoteJsonToMarkdown` / `markdownToBlockNoteJson` from `@research-canvas/exporter` for its "export node to .md" / "import .md into node body" flows. WS4 MUST NOT create `packages/canvas/src/content/blockNoteMarkdown.ts` (or any other parallel copy) — there is exactly one home for these functions.
> - Whichever of WS3/WS4/WS7 reaches `renderMarkdown.ts` first creates the exports; the others consume them. The grep guard in Tasks 6 and 7 makes ordering immaterial.

---

## Task 1: Scaffold the `@research-canvas/node-document` package

**Files:**
- Create: `packages/node-document/package.json`
- Create: `packages/node-document/tsconfig.json`
- Create: `packages/node-document/src/index.ts`
- Create: `packages/node-document/src/body.test.ts`
- Create: `packages/node-document/src/body.ts`

**Interfaces:**
- Consumes: nothing (greenfield package).
- Produces: `EMPTY_BLOCKNOTE_DOC: string`, `isEmptyBlockNoteBody(body: string): boolean` (re-exported from `src/index.ts`).

**Step 1: Write failing test**

- [ ] Create `packages/node-document/src/body.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { EMPTY_BLOCKNOTE_DOC, isEmptyBlockNoteBody } from "./body";

describe("EMPTY_BLOCKNOTE_DOC", () => {
  it("is the empty block array sentinel", () => {
    expect(EMPTY_BLOCKNOTE_DOC).toBe("[]");
  });
});

describe("isEmptyBlockNoteBody", () => {
  it("treats empty string as empty", () => {
    expect(isEmptyBlockNoteBody("")).toBe(true);
  });

  it("treats the empty block array string as empty", () => {
    expect(isEmptyBlockNoteBody("[]")).toBe(true);
  });

  it("treats a whitespace-only string as empty", () => {
    expect(isEmptyBlockNoteBody("  \n ")).toBe(true);
  });

  it("treats a populated block array as non-empty", () => {
    expect(isEmptyBlockNoteBody('[{"type":"paragraph"}]')).toBe(false);
  });
});
```

**Step 2: Run test, expect failure**

- [ ] Run:

```bash
pnpm vitest run packages/node-document/src/body.test.ts
```

Expected: FAIL — `Error: Failed to resolve import "./body"` (file does not exist yet).

**Step 3: Create the package manifest, tsconfig, and implementation**

- [ ] Create `packages/node-document/package.json`:

```json
{
  "name": "@research-canvas/node-document",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@research-canvas/schema": "workspace:*",
    "zustand": "^5.0.8"
  }
}
```

- [ ] Create `packages/node-document/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] Create `packages/node-document/src/body.ts`:

```ts
/** The literal empty-doc sentinel (BlockNote's empty block array). WS0 §7. */
export const EMPTY_BLOCKNOTE_DOC = "[]";

/** Frontend treats "" and "[]" (and whitespace-only) as an empty body. WS0 §7. */
export function isEmptyBlockNoteBody(body: string): boolean {
  const trimmed = body.trim();
  return trimmed === "" || trimmed === "[]";
}
```

- [ ] Create `packages/node-document/src/index.ts`:

```ts
export { EMPTY_BLOCKNOTE_DOC, isEmptyBlockNoteBody } from "./body";
```

**Step 4: Run test, expect pass**

- [ ] Run:

```bash
pnpm vitest run packages/node-document/src/body.test.ts
```

Expected: PASS — `Test Files  1 passed (1)`, `Tests  5 passed (5)`.

**Step 5: Commit**

- [ ] Run:

```bash
git add packages/node-document/package.json packages/node-document/tsconfig.json packages/node-document/src/index.ts packages/node-document/src/body.ts packages/node-document/src/body.test.ts
git commit -m "feat(node-document): scaffold package with empty-body helpers"
```

---

## Task 2: `normaliseBlockNoteBody` — coerce empty/garbage bodies to the sentinel

**Files:**
- Modify: `packages/node-document/src/body.test.ts` (append a `describe` block)
- Modify: `packages/node-document/src/body.ts` (add `normaliseBlockNoteBody`)
- Modify: `packages/node-document/src/index.ts` (re-export `normaliseBlockNoteBody`)

**Interfaces:**
- Consumes: `EMPTY_BLOCKNOTE_DOC`, `isEmptyBlockNoteBody` (Task 1).
- Produces: `normaliseBlockNoteBody(body: string): string` — returns `"[]"` for empty/whitespace/unparseable input or input that is not a JSON array; otherwise returns the trimmed input verbatim.

**Step 1: Write failing test**

- [ ] Append to `packages/node-document/src/body.test.ts`:

```ts
import { normaliseBlockNoteBody } from "./body";

describe("normaliseBlockNoteBody", () => {
  it("returns the sentinel for an empty string", () => {
    expect(normaliseBlockNoteBody("")).toBe("[]");
  });

  it("returns the sentinel for whitespace", () => {
    expect(normaliseBlockNoteBody("   ")).toBe("[]");
  });

  it("returns the sentinel for unparseable JSON", () => {
    expect(normaliseBlockNoteBody("{not json")).toBe("[]");
  });

  it("returns the sentinel for non-array JSON (e.g. an object)", () => {
    expect(normaliseBlockNoteBody('{"type":"doc"}')).toBe("[]");
  });

  it("returns a valid block array trimmed and verbatim", () => {
    expect(normaliseBlockNoteBody('  [{"type":"paragraph"}] ')).toBe(
      '[{"type":"paragraph"}]'
    );
  });
});
```

**Step 2: Run test, expect failure**

- [ ] Run:

```bash
pnpm vitest run packages/node-document/src/body.test.ts
```

Expected: FAIL — `body.ts(...)` does not export `normaliseBlockNoteBody`; Vitest reports `normaliseBlockNoteBody is not a function`.

**Step 3: Implement**

- [ ] Add to `packages/node-document/src/body.ts` (below `isEmptyBlockNoteBody`):

```ts
/**
 * Coerce any stored body to a safe BlockNote block-array JSON string.
 * Empty, whitespace, unparseable, or non-array input collapses to "[]".
 * Valid block-array JSON is returned trimmed and verbatim (never rewritten).
 */
export function normaliseBlockNoteBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed === "" || trimmed === "[]") {
    return EMPTY_BLOCKNOTE_DOC;
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return trimmed;
    }
    return EMPTY_BLOCKNOTE_DOC;
  } catch {
    return EMPTY_BLOCKNOTE_DOC;
  }
}
```

- [ ] Add to `packages/node-document/src/index.ts`:

```ts
export { EMPTY_BLOCKNOTE_DOC, isEmptyBlockNoteBody, normaliseBlockNoteBody } from "./body";
```

(Replace the existing `export { ... } from "./body";` line with the line above.)

**Step 4: Run test, expect pass**

- [ ] Run:

```bash
pnpm vitest run packages/node-document/src/body.test.ts
```

Expected: PASS — `Tests  10 passed (10)`.

**Step 5: Commit**

- [ ] Run:

```bash
git add packages/node-document/src/body.ts packages/node-document/src/body.test.ts packages/node-document/src/index.ts
git commit -m "feat(node-document): add normaliseBlockNoteBody coercion"
```

---

## Task 3: `blockNoteSummary` — plain-text digest of a body (for compact view + `GraphNode.summary`)

**Files:**
- Create: `packages/node-document/src/summary.test.ts`
- Create: `packages/node-document/src/summary.ts`
- Modify: `packages/node-document/src/index.ts` (re-export `blockNoteSummary`)

**Interfaces:**
- Consumes: nothing.
- Produces: `blockNoteSummary(body: string, maxChars?: number): string` — extracts inline text from BlockNote block-array JSON, joins block texts with a single space, collapses whitespace, truncates to `maxChars` (default `200`) appending `"…"` when truncated. Returns `""` for empty/unparseable bodies.

**Step 1: Write failing test**

- [ ] Create `packages/node-document/src/summary.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { blockNoteSummary } from "./summary";

const TWO_PARAGRAPHS = JSON.stringify([
  {
    type: "paragraph",
    content: [
      { type: "text", text: "The monopoly mechanism " },
      { type: "text", text: "recurs across eras." },
    ],
  },
  {
    type: "paragraph",
    content: [{ type: "text", text: "A second paragraph." }],
  },
]);

describe("blockNoteSummary", () => {
  it("returns empty string for an empty body", () => {
    expect(blockNoteSummary("[]")).toBe("");
  });

  it("returns empty string for unparseable input", () => {
    expect(blockNoteSummary("{not json")).toBe("");
  });

  it("joins block text with single spaces", () => {
    expect(blockNoteSummary(TWO_PARAGRAPHS)).toBe(
      "The monopoly mechanism recurs across eras. A second paragraph."
    );
  });

  it("truncates to maxChars and appends an ellipsis", () => {
    expect(blockNoteSummary(TWO_PARAGRAPHS, 20)).toBe("The monopoly mechani…");
  });
});
```

**Step 2: Run test, expect failure**

- [ ] Run:

```bash
pnpm vitest run packages/node-document/src/summary.test.ts
```

Expected: FAIL — `Error: Failed to resolve import "./summary"`.

**Step 3: Implement**

- [ ] Create `packages/node-document/src/summary.ts`:

```ts
interface InlineNode {
  type?: string;
  text?: string;
  content?: unknown;
}

interface BlockNode {
  content?: unknown;
}

function extractInlineText(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }
  const parts: string[] = [];
  for (const item of content as InlineNode[]) {
    if (item && typeof item.text === "string") {
      parts.push(item.text);
    } else if (item && Array.isArray(item.content)) {
      parts.push(extractInlineText(item.content));
    }
  }
  return parts.join("");
}

/**
 * Plain-text digest of a BlockNote body. Joins each block's inline text with a
 * single space, collapses runs of whitespace, truncates to maxChars (default
 * 200) with a trailing "…". Empty/unparseable bodies yield "".
 */
export function blockNoteSummary(body: string, maxChars = 200): string {
  let blocks: BlockNode[];
  try {
    const parsed = JSON.parse(body);
    if (!Array.isArray(parsed)) {
      return "";
    }
    blocks = parsed as BlockNode[];
  } catch {
    return "";
  }

  const text = blocks
    .map((block) => extractInlineText(block?.content))
    .filter((value) => value.length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}…`;
}
```

- [ ] Add to `packages/node-document/src/index.ts`:

```ts
export { blockNoteSummary } from "./summary";
```

**Step 4: Run test, expect pass**

- [ ] Run:

```bash
pnpm vitest run packages/node-document/src/summary.test.ts
```

Expected: PASS — `Tests  4 passed (4)`.

**Step 5: Commit**

- [ ] Run:

```bash
git add packages/node-document/src/summary.ts packages/node-document/src/summary.test.ts packages/node-document/src/index.ts
git commit -m "feat(node-document): add blockNoteSummary plain-text digest"
```

---

## Task 4: `createNodeDocumentStore` — Zustand vanilla store owning one node's body with debounced flush

**Files:**
- Create: `packages/node-document/src/nodeDocumentStore.test.ts`
- Create: `packages/node-document/src/nodeDocumentStore.ts`
- Modify: `packages/node-document/src/index.ts` (re-export store factory + types)

**Interfaces:**
- Consumes: `normaliseBlockNoteBody` (Task 2), `blockNoteSummary` (Task 3), `isEmptyBlockNoteBody` (Task 1).
- Produces:
  - `interface NodeDocumentState { graphNodeId: string; body: string; savedBody: string; status: "idle" | "dirty" | "saving" | "error"; errorMessage: string | null; setBody(next: string): void; flushNow(): Promise<void>; }`
  - `type NodeDocumentStore = import("zustand").StoreApi<NodeDocumentState>`
  - `function createNodeDocumentStore(input: { graphNodeId: string; initialBody: string; flush: (body: string, summary: string) => Promise<void>; debounceMs?: number }): NodeDocumentStore`

  Behaviour: `setBody` normalises input, sets `body`, marks `status = "dirty"`, and schedules a debounced (`debounceMs`, default `400`) call to `flush(body, summary)`. On flush success `savedBody = body`, `status = "idle"`, `errorMessage = null`. On flush rejection `status = "error"`, `errorMessage` set (error surfaced, never swallowed — WS1 robustness bar); critically, `savedBody` is **left unchanged** and `body` (the dirty body) is **retained, never discarded**, so the edit is not lost and the next `setBody`/`flushNow` retries it (`body !== savedBody` ⇒ retry path stays live). `flushNow()` cancels the timer and flushes immediately; it is a no-op when `body === savedBody`. Concurrent flushes are serialised (a flush in flight defers a queued one).

**Step 1: Write failing test**

- [ ] Create `packages/node-document/src/nodeDocumentStore.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createNodeDocumentStore } from "./nodeDocumentStore";

const POPULATED = '[{"type":"paragraph","content":[{"type":"text","text":"Hi"}]}]';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createNodeDocumentStore", () => {
  it("starts idle with the normalised initial body", () => {
    const store = createNodeDocumentStore({
      graphNodeId: "n1",
      initialBody: "",
      flush: async () => {},
    });
    const state = store.getState();
    expect(state.body).toBe("[]");
    expect(state.savedBody).toBe("[]");
    expect(state.status).toBe("idle");
    expect(state.errorMessage).toBeNull();
  });

  it("marks dirty immediately on setBody and flushes after the debounce", async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const store = createNodeDocumentStore({
      graphNodeId: "n1",
      initialBody: "[]",
      flush,
      debounceMs: 400,
    });

    store.getState().setBody(POPULATED);
    expect(store.getState().status).toBe("dirty");
    expect(flush).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400);

    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(POPULATED, "Hi");
    expect(store.getState().status).toBe("idle");
    expect(store.getState().savedBody).toBe(POPULATED);
  });

  it("debounces rapid edits into a single flush", async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const store = createNodeDocumentStore({
      graphNodeId: "n1",
      initialBody: "[]",
      flush,
      debounceMs: 400,
    });

    store.getState().setBody('[{"type":"paragraph","content":[{"type":"text","text":"a"}]}]');
    await vi.advanceTimersByTimeAsync(100);
    store.getState().setBody('[{"type":"paragraph","content":[{"type":"text","text":"ab"}]}]');
    await vi.advanceTimersByTimeAsync(400);

    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(
      '[{"type":"paragraph","content":[{"type":"text","text":"ab"}]}]',
      "ab"
    );
  });

  it("surfaces flush errors instead of swallowing them and retains the dirty body for retry", async () => {
    const flush = vi.fn().mockRejectedValue(new Error("neo4j unreachable"));
    const store = createNodeDocumentStore({
      graphNodeId: "n1",
      initialBody: "[]",
      flush,
      debounceMs: 400,
    });

    store.getState().setBody(POPULATED);
    await vi.advanceTimersByTimeAsync(400);

    expect(store.getState().status).toBe("error");
    expect(store.getState().errorMessage).toBe("neo4j unreachable");
    // savedBody is NOT advanced on failure (the last-known-good remains "[]")...
    expect(store.getState().savedBody).toBe("[]");
    // ...and the dirty body is retained (NOT lost) so the next edit / flushNow can retry it.
    expect(store.getState().body).toBe(POPULATED);
  });

  it("retries the retained dirty body via flushNow after a failure, then surfaces success", async () => {
    const flush = vi
      .fn()
      .mockRejectedValueOnce(new Error("neo4j unreachable"))
      .mockResolvedValueOnce(undefined);
    const store = createNodeDocumentStore({
      graphNodeId: "n1",
      initialBody: "[]",
      flush,
      debounceMs: 400,
    });

    store.getState().setBody(POPULATED);
    await vi.advanceTimersByTimeAsync(400);
    expect(store.getState().status).toBe("error");

    // The retained dirty body is still flushable — flushNow retries it (savedBody !== body).
    await store.getState().flushNow();

    expect(flush).toHaveBeenCalledTimes(2);
    expect(flush).toHaveBeenLastCalledWith(POPULATED, "Hi");
    expect(store.getState().status).toBe("idle");
    expect(store.getState().errorMessage).toBeNull();
    expect(store.getState().savedBody).toBe(POPULATED);
  });

  it("flushNow flushes immediately and is a no-op when not dirty", async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const store = createNodeDocumentStore({
      graphNodeId: "n1",
      initialBody: "[]",
      flush,
      debounceMs: 400,
    });

    await store.getState().flushNow();
    expect(flush).not.toHaveBeenCalled();

    store.getState().setBody(POPULATED);
    await store.getState().flushNow();
    expect(flush).toHaveBeenCalledTimes(1);
    expect(store.getState().status).toBe("idle");
    expect(store.getState().savedBody).toBe(POPULATED);
  });
});
```

**Step 2: Run test, expect failure**

- [ ] Run:

```bash
pnpm vitest run packages/node-document/src/nodeDocumentStore.test.ts
```

Expected: FAIL — `Error: Failed to resolve import "./nodeDocumentStore"`.

**Step 3: Implement**

- [ ] Create `packages/node-document/src/nodeDocumentStore.ts`:

```ts
import { createStore, type StoreApi } from "zustand/vanilla";

import { blockNoteSummary } from "./summary";
import { normaliseBlockNoteBody } from "./body";

export interface NodeDocumentState {
  graphNodeId: string;
  body: string;
  savedBody: string;
  status: "idle" | "dirty" | "saving" | "error";
  errorMessage: string | null;
  setBody(next: string): void;
  flushNow(): Promise<void>;
}

export type NodeDocumentStore = StoreApi<NodeDocumentState>;

export interface CreateNodeDocumentStoreInput {
  graphNodeId: string;
  initialBody: string;
  flush: (body: string, summary: string) => Promise<void>;
  debounceMs?: number;
}

export function createNodeDocumentStore(
  input: CreateNodeDocumentStoreInput
): NodeDocumentStore {
  const debounceMs = input.debounceMs ?? 400;
  const initial = normaliseBlockNoteBody(input.initialBody);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let flushing = false;
  let queued = false;

  const store = createStore<NodeDocumentState>((set, get) => {
    const runFlush = async (): Promise<void> => {
      const { body, savedBody } = get();
      if (body === savedBody) {
        return;
      }
      if (flushing) {
        queued = true;
        return;
      }
      flushing = true;
      set({ status: "saving" });
      const toSave = body;
      try {
        await input.flush(toSave, blockNoteSummary(toSave));
        set({ savedBody: toSave, status: "idle", errorMessage: null });
      } catch (error) {
        set({
          status: "error",
          errorMessage:
            error instanceof Error
              ? error.message
              : typeof error === "string"
                ? error
                : "failed to save node document",
        });
      } finally {
        flushing = false;
        if (queued) {
          queued = false;
          await runFlush();
        }
      }
    };

    return {
      graphNodeId: input.graphNodeId,
      body: initial,
      savedBody: initial,
      status: "idle",
      errorMessage: null,
      setBody(next: string) {
        const normalised = normaliseBlockNoteBody(next);
        if (normalised === get().body) {
          return;
        }
        set({ body: normalised, status: "dirty" });
        if (timer !== null) {
          clearTimeout(timer);
        }
        timer = setTimeout(() => {
          timer = null;
          void runFlush();
        }, debounceMs);
      },
      async flushNow() {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        await runFlush();
      },
    };
  });

  return store;
}
```

- [ ] Add to `packages/node-document/src/index.ts`:

```ts
export {
  createNodeDocumentStore,
  type NodeDocumentState,
  type NodeDocumentStore,
  type CreateNodeDocumentStoreInput,
} from "./nodeDocumentStore";
```

**Step 4: Run test, expect pass**

- [ ] Run:

```bash
pnpm vitest run packages/node-document/src/nodeDocumentStore.test.ts
```

Expected: PASS — `Tests  6 passed (6)`. (The two new assertions — that `body` is retained on failure, and that `flushNow` retries the retained body to success — pass with no implementation change, because `runFlush` only advances `savedBody` inside the success branch and never mutates `body` on error. If either reports red, the store is discarding the dirty body on failure and must be fixed to keep it.)

**Step 5: Commit**

- [ ] Run:

```bash
git add packages/node-document/src/nodeDocumentStore.ts packages/node-document/src/nodeDocumentStore.test.ts packages/node-document/src/index.ts
git commit -m "feat(node-document): add debounced node-document store with surfaced errors + retained dirty body"
```

---

## Task 4A: `flushOnClose` — crash-safe final write of the dirty body (WS1 robustness bar)

> **Why this task (spec §5.3 / §8 "same robustness bar as 5.1").** WS1's saving fix guarantees two things for layout writes: (a) errors are **surfaced, never swallowed**, and (b) a **crash-safe flush** runs on close so the last in-flight edit is not lost. Task 4's debounced flush gives (a) for the node *body*. This task gives (b): a `flushOnClose()` path that forces a final best-effort write of the dirty body when the document view unmounts or the window unloads, and **reports its outcome** (`true` only when the body is durably saved or already clean; `false` with `status === "error"` + `errorMessage` set when the final write fails) — it must not return `false` silently the way the original silent-save bug did. The body IS the theory, so its close-flush must meet the same bar.

**Files:**
- Modify: `packages/node-document/src/nodeDocumentStore.test.ts` (append a `describe` block)
- Modify: `packages/node-document/src/nodeDocumentStore.ts` (add `flushOnClose` to the state + impl)

**Interfaces:**
- Consumes: the store internals from Task 4 (`runFlush`, `timer`, `body`, `savedBody`).
- Produces: extends `NodeDocumentState` with `flushOnClose(): Promise<boolean>`.

  Behaviour: `flushOnClose()` cancels any pending debounce timer and performs one immediate final flush of the current dirty body (mirroring `flushNow`, but with an explicit boolean outcome for the close path). It resolves `true` when nothing is dirty (`body === savedBody`) or the final write succeeds (`savedBody` advanced, `status === "idle"`). On a rejected final write it resolves `false` **and** sets `status === "error"` + a non-null `errorMessage` and **retains the dirty `body`** — the failure is surfaced (never a silent `return false`), and the unsaved edit is preserved for a later retry. This is the store-level mirror of WS1's crash-safe flush; the UI wiring (Task 11) calls it on unmount/`beforeunload`.

**Step 1: Write failing test**

- [ ] Append to `packages/node-document/src/nodeDocumentStore.test.ts`:

```ts
describe("flushOnClose", () => {
  it("returns true and is a no-op when nothing is dirty", async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const store = createNodeDocumentStore({
      graphNodeId: "n1",
      initialBody: "[]",
      flush,
      debounceMs: 400,
    });

    await expect(store.getState().flushOnClose()).resolves.toBe(true);
    expect(flush).not.toHaveBeenCalled();
  });

  it("forces a final write of the dirty body before the debounce fires and returns true", async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const store = createNodeDocumentStore({
      graphNodeId: "n1",
      initialBody: "[]",
      flush,
      debounceMs: 400,
    });

    store.getState().setBody(POPULATED);
    // Close arrives BEFORE the 400ms debounce would have flushed — the pending
    // timer must be cancelled and the body written immediately (crash-safe flush).
    await expect(store.getState().flushOnClose()).resolves.toBe(true);

    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(POPULATED, "Hi");
    expect(store.getState().status).toBe("idle");
    expect(store.getState().savedBody).toBe(POPULATED);
  });

  it("returns false and surfaces the error (does not swallow) when the final write fails", async () => {
    const flush = vi.fn().mockRejectedValue(new Error("disk full on close"));
    const store = createNodeDocumentStore({
      graphNodeId: "n1",
      initialBody: "[]",
      flush,
      debounceMs: 400,
    });

    store.getState().setBody(POPULATED);
    await expect(store.getState().flushOnClose()).resolves.toBe(false);

    expect(store.getState().status).toBe("error");
    expect(store.getState().errorMessage).toBe("disk full on close");
    // The dirty body survives the failed close so it can be retried.
    expect(store.getState().body).toBe(POPULATED);
    expect(store.getState().savedBody).toBe("[]");
  });
});
```

**Step 2: Run test, expect failure**

- [ ] Run:

```bash
pnpm vitest run packages/node-document/src/nodeDocumentStore.test.ts
```

Expected: FAIL — `store.getState().flushOnClose is not a function` (the method does not exist yet).

**Step 3: Implement**

- [ ] Add `flushOnClose` to the `NodeDocumentState` interface in `packages/node-document/src/nodeDocumentStore.ts` (after `flushNow`):

```ts
  flushNow(): Promise<void>;
  /**
   * Crash-safe final flush for the close/unload path (WS1 robustness bar).
   * Cancels any pending debounce, writes the dirty body immediately, and reports
   * the outcome: resolves true when clean or durably saved; resolves false AND
   * sets status="error" with a non-null errorMessage (never a silent return) when
   * the final write fails, retaining the dirty body for retry.
   */
  flushOnClose(): Promise<boolean>;
```

- [ ] Add the `flushOnClose` implementation inside the returned store object in `createNodeDocumentStore` (immediately after `flushNow`):

```ts
      async flushNow() {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        await runFlush();
      },
      async flushOnClose() {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        if (get().body === get().savedBody) {
          return true;
        }
        await runFlush();
        // runFlush surfaces failures via status/errorMessage (never swallows).
        // Report durability honestly: true only if the body is now saved.
        return get().status !== "error" && get().body === get().savedBody;
      },
```

(Replace the existing `async flushNow() { ... },` block with the two-method block above so `flushOnClose` sits next to it.)

**Step 4: Run test, expect pass**

- [ ] Run:

```bash
pnpm vitest run packages/node-document/src/nodeDocumentStore.test.ts
```

Expected: PASS — `Tests  9 passed (9)` (the 6 from Task 4 plus the 3 new `flushOnClose` cases).

**Step 5: Commit**

- [ ] Run:

```bash
git add packages/node-document/src/nodeDocumentStore.ts packages/node-document/src/nodeDocumentStore.test.ts
git commit -m "feat(node-document): add crash-safe flushOnClose that surfaces close-write failures"
```

---

## Task 5: Register `node-document` in the workspace + verify it type-checks

**Files:**
- Modify: `tsconfig.json` (repo root — add the package to the project references, after the last existing `packages/*` reference)
- Modify: `pnpm-workspace.yaml` (only if `packages/*` is not already a glob — verify first)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing new; makes Task 1–4 + 4A exports resolvable across the monorepo.

**Step 1: Verify the workspace glob already covers the package**

- [ ] Run:

```bash
cat "/Users/admin/Documents/Antichrist Project/pnpm-workspace.yaml"
```

Expected: a `packages:` list that includes `packages/*` (so `packages/node-document` is already a workspace member). If it lists packages individually, add `- "packages/node-document"`.

**Step 2: Verify install resolves the new package**

- [ ] Run:

```bash
pnpm install
```

Expected: completes without error; `@research-canvas/node-document` appears as an installed workspace package (no `ERR_PNPM` output).

**Step 3: Add the project reference and type-check**

- [ ] Run:

```bash
cat "/Users/admin/Documents/Antichrist Project/tsconfig.json"
```

Expected: a `references` array listing each `packages/*` and `apps/*` tsconfig.

- [ ] Add to the root `tsconfig.json` `references` array (alphabetical, near the other `packages/*` entries):

```json
    { "path": "packages/node-document" },
```

**Step 4: Run type-check, expect pass**

- [ ] Run:

```bash
pnpm exec tsc -b
```

Expected: PASS — exits 0, no diagnostics. (If `tsconfig.base.json` does not exist, change `packages/node-document/tsconfig.json`'s `extends` to match whatever the other packages extend — confirm with `cat packages/viewers/tsconfig.json`.)

**Step 5: Commit**

- [ ] Run:

```bash
git add tsconfig.json pnpm-workspace.yaml
git commit -m "chore(node-document): register package in workspace + tsconfig references"
```

---

## Task 6: `blockNoteJsonToMarkdown` — serialise a body to Markdown (WS0 §7 contract)

**Files:**
- Modify: `packages/exporter/src/renderMarkdown.ts` (append the new export at end of file)
- Create: `packages/exporter/src/blockNoteMarkdown.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export function blockNoteJsonToMarkdown(bodyJson: string): string` (WS0 §7). Maps BlockNote blocks to Markdown: `heading` (`props.level` 1–3) → `#`/`##`/`###`; `paragraph` → text line; `bulletListItem` → `- `; `numberedListItem` → `1. `; `quote` → `> `; `codeBlock` → fenced ```` ``` ````; `image` (`props.url`, optional `props.caption`) → `![caption](url)`. Inline styles: `bold` → `**`, `italic` → `*`, `code` → `` ` ``. Blocks joined by blank lines. Empty/unparseable bodies yield `""`.

**Step 1: Write failing test**

- [ ] Create `packages/exporter/src/blockNoteMarkdown.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { blockNoteJsonToMarkdown } from "./renderMarkdown";

describe("blockNoteJsonToMarkdown", () => {
  it("returns empty string for an empty body", () => {
    expect(blockNoteJsonToMarkdown("[]")).toBe("");
  });

  it("returns empty string for unparseable input", () => {
    expect(blockNoteJsonToMarkdown("{not json")).toBe("");
  });

  it("renders a heading by level", () => {
    const body = JSON.stringify([
      { type: "heading", props: { level: 2 }, content: [{ type: "text", text: "Origins" }] },
    ]);
    expect(blockNoteJsonToMarkdown(body)).toBe("## Origins");
  });

  it("renders a paragraph with bold and italic inline styles", () => {
    const body = JSON.stringify([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "The ", styles: {} },
          { type: "text", text: "monopoly", styles: { bold: true } },
          { type: "text", text: " ", styles: {} },
          { type: "text", text: "mechanism", styles: { italic: true } },
        ],
      },
    ]);
    expect(blockNoteJsonToMarkdown(body)).toBe("The **monopoly** *mechanism*");
  });

  it("renders bullet and numbered list items", () => {
    const body = JSON.stringify([
      { type: "bulletListItem", content: [{ type: "text", text: "first" }] },
      { type: "numberedListItem", content: [{ type: "text", text: "second" }] },
    ]);
    expect(blockNoteJsonToMarkdown(body)).toBe("- first\n\n1. second");
  });

  it("renders an image block as markdown image with caption alt", () => {
    const body = JSON.stringify([
      { type: "image", props: { url: "assets/n1/diagram.png", caption: "Diagram" } },
    ]);
    expect(blockNoteJsonToMarkdown(body)).toBe("![Diagram](assets/n1/diagram.png)");
  });

  it("renders a quote and a fenced code block", () => {
    const body = JSON.stringify([
      { type: "quote", content: [{ type: "text", text: "as above" }] },
      { type: "codeBlock", content: [{ type: "text", text: "const x = 1;" }] },
    ]);
    expect(blockNoteJsonToMarkdown(body)).toBe("> as above\n\n```\nconst x = 1;\n```");
  });
});
```

**Step 2: Run test, expect failure**

- [ ] Run:

```bash
pnpm vitest run packages/exporter/src/blockNoteMarkdown.test.ts
```

Expected: FAIL — `renderMarkdown.ts` does not export `blockNoteJsonToMarkdown`; Vitest reports `blockNoteJsonToMarkdown is not a function`.

**Step 3: Implement**

> **Single-producer guard (WS3 owns these exports — WS0 §7).** WS3 is the single producer of `blockNoteJsonToMarkdown`/`markdownToBlockNoteJson`. WS4 and WS7 consume them from `@research-canvas/exporter`; either may have landed first. Before appending, grep for the export and **skip creation if it already exists** (so WS7/WS4 landing first is harmless — never duplicate the definition):

- [ ] Run:

```bash
grep -n "export function blockNoteJsonToMarkdown" "packages/exporter/src/renderMarkdown.ts"
```

If this prints a match, the function already exists (added by WS4/WS7): **skip the append below**, jump to Step 4, and confirm the existing implementation satisfies this task's tests (adjust only if a test fails). If it prints nothing, proceed with the append.

- [ ] Append to `packages/exporter/src/renderMarkdown.ts` (after the existing `escapeHtml` function):

```ts
interface BnInline {
  type?: string;
  text?: string;
  styles?: { bold?: boolean; italic?: boolean; code?: boolean };
}

interface BnBlock {
  type?: string;
  props?: { level?: number; url?: string; caption?: string };
  content?: unknown;
}

function renderBnInline(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }
  return (content as BnInline[])
    .map((node) => {
      if (typeof node.text !== "string") {
        return "";
      }
      let text = node.text;
      const styles = node.styles ?? {};
      if (styles.code) {
        text = `\`${text}\``;
      }
      if (styles.bold) {
        text = `**${text}**`;
      }
      if (styles.italic) {
        text = `*${text}*`;
      }
      return text;
    })
    .join("");
}

function renderBnBlock(block: BnBlock): string {
  const inline = renderBnInline(block.content);
  switch (block.type) {
    case "heading": {
      const level = Math.min(Math.max(block.props?.level ?? 1, 1), 3);
      return `${"#".repeat(level)} ${inline}`;
    }
    case "bulletListItem":
      return `- ${inline}`;
    case "numberedListItem":
      return `1. ${inline}`;
    case "quote":
      return `> ${inline}`;
    case "codeBlock":
      return `\`\`\`\n${inline}\n\`\`\``;
    case "image": {
      const url = block.props?.url ?? "";
      const caption = block.props?.caption ?? "";
      return `![${caption}](${url})`;
    }
    case "paragraph":
    default:
      return inline;
  }
}

/**
 * Convert a stored BlockNote/ProseMirror body JSON string to Markdown.
 * Used by the static web layer and "export node to .md" linking. (WS0 §7)
 */
export function blockNoteJsonToMarkdown(bodyJson: string): string {
  let blocks: BnBlock[];
  try {
    const parsed = JSON.parse(bodyJson);
    if (!Array.isArray(parsed)) {
      return "";
    }
    blocks = parsed as BnBlock[];
  } catch {
    return "";
  }
  return blocks.map((block) => renderBnBlock(block)).join("\n\n");
}
```

**Step 4: Run test, expect pass**

- [ ] Run:

```bash
pnpm vitest run packages/exporter/src/blockNoteMarkdown.test.ts
```

Expected: PASS — `Tests  7 passed (7)`.

**Step 5: Commit**

- [ ] Run:

```bash
git add packages/exporter/src/renderMarkdown.ts packages/exporter/src/blockNoteMarkdown.test.ts
git commit -m "feat(exporter): add blockNoteJsonToMarkdown body serialiser"
```

---

## Task 7: `markdownToBlockNoteJson` — inverse import (WS0 §7 contract, for WS4)

**Files:**
- Modify: `packages/exporter/src/renderMarkdown.ts` (append the new export)
- Modify: `packages/exporter/src/blockNoteMarkdown.test.ts` (append a `describe` block)

**Interfaces:**
- Consumes: nothing.
- Produces: `export function markdownToBlockNoteJson(markdown: string): string` (WS0 §7). Parses a subset of Markdown line-by-line into a BlockNote block array JSON string: `#`/`##`/`###` → `heading` with `props.level`; `- `/`* `/`+ ` → `bulletListItem`; `N. ` → `numberedListItem`; `> ` → `quote`; non-empty line → `paragraph`; blank lines are separators. Returns `"[]"` for empty input. Inline content is a single unstyled text node per block.

**Step 1: Write failing test**

- [ ] Append to `packages/exporter/src/blockNoteMarkdown.test.ts`:

```ts
import { markdownToBlockNoteJson } from "./renderMarkdown";

describe("markdownToBlockNoteJson", () => {
  it("returns the empty block array for empty input", () => {
    expect(markdownToBlockNoteJson("")).toBe("[]");
  });

  it("round-trips a heading", () => {
    const json = markdownToBlockNoteJson("## Origins");
    expect(JSON.parse(json)).toEqual([
      {
        type: "heading",
        props: { level: 2 },
        content: [{ type: "text", text: "Origins", styles: {} }],
      },
    ]);
  });

  it("parses a paragraph and a bullet item", () => {
    const json = markdownToBlockNoteJson("Hello world\n\n- a point");
    expect(JSON.parse(json)).toEqual([
      {
        type: "paragraph",
        content: [{ type: "text", text: "Hello world", styles: {} }],
      },
      {
        type: "bulletListItem",
        content: [{ type: "text", text: "a point", styles: {} }],
      },
    ]);
  });
});
```

**Step 2: Run test, expect failure**

- [ ] Run:

```bash
pnpm vitest run packages/exporter/src/blockNoteMarkdown.test.ts
```

Expected: FAIL — `markdownToBlockNoteJson is not a function`.

**Step 3: Implement**

> **Single-producer guard (WS3 owns these exports — WS0 §7).** As in Task 6, WS3 is the single producer; WS4 (which imports `markdownToBlockNoteJson` for its .md-import flow) or WS7 may have landed it first. Grep before appending and **skip creation if it already exists** (so WS4/WS7 landing first is harmless):

- [ ] Run:

```bash
grep -n "export function markdownToBlockNoteJson" "packages/exporter/src/renderMarkdown.ts"
```

If this prints a match, the function already exists: **skip the append below**, jump to Step 4, and confirm the existing implementation satisfies this task's tests (adjust only if a test fails). If it prints nothing, proceed with the append. (The `textBlock`/`BnBlock` helpers below are also added by Task 6's block; if Task 6 was skipped because the export pre-existed, those helpers already exist too — do not redefine them.)

- [ ] Append to `packages/exporter/src/renderMarkdown.ts` (after `blockNoteJsonToMarkdown`):

```ts
function textBlock(type: string, text: string, props?: Record<string, unknown>): BnBlock {
  const block: BnBlock & { content: unknown } = {
    type,
    content: [{ type: "text", text, styles: {} }],
  };
  if (props) {
    (block as Record<string, unknown>).props = props;
  }
  return block;
}

/**
 * Inverse of blockNoteJsonToMarkdown, for importing a linked .md file into a
 * node body (WS4). Parses a Markdown subset; returns "[]" for empty input. (WS0 §7)
 */
export function markdownToBlockNoteJson(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: BnBlock[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      blocks.push(textBlock("heading", heading[2], { level: heading[1].length }));
      continue;
    }
    if (/^[-*+]\s+/.test(line)) {
      blocks.push(textBlock("bulletListItem", line.replace(/^[-*+]\s+/, "")));
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      blocks.push(textBlock("numberedListItem", line.replace(/^\d+\.\s+/, "")));
      continue;
    }
    if (/^>\s?/.test(line)) {
      blocks.push(textBlock("quote", line.replace(/^>\s?/, "")));
      continue;
    }
    blocks.push(textBlock("paragraph", line));
  }

  return JSON.stringify(blocks);
}
```

**Step 4: Run test, expect pass**

- [ ] Run:

```bash
pnpm vitest run packages/exporter/src/blockNoteMarkdown.test.ts
```

Expected: PASS — `Tests  10 passed (10)`.

**Step 5: Commit**

- [ ] Run:

```bash
git add packages/exporter/src/renderMarkdown.ts packages/exporter/src/blockNoteMarkdown.test.ts
git commit -m "feat(exporter): add markdownToBlockNoteJson inverse import"
```

---

## Task 8: Add BlockNote dependencies to `@research-canvas/viewers`

**Files:**
- Modify: `packages/viewers/package.json` (add `@blocknote/core`, `@blocknote/react`, `@blocknote/mantine`, `@research-canvas/node-document`)

**Interfaces:**
- Consumes: `@research-canvas/node-document` (Task 1–4).
- Produces: nothing new yet; makes BlockNote importable inside `packages/viewers`.

**Step 1: Pin known-good versions and install**

- [ ] Replace `packages/viewers/package.json` with:

```json
{
  "name": "@research-canvas/viewers",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@blocknote/core": "^0.39.1",
    "@blocknote/mantine": "^0.39.1",
    "@blocknote/react": "^0.39.1",
    "@research-canvas/node-document": "workspace:*",
    "@research-canvas/schema": "workspace:*",
    "react": "^19.1.1"
  }
}
```

**Step 2: Run install, expect resolution**

- [ ] Run:

```bash
pnpm install
```

Expected: completes; `@blocknote/core`, `@blocknote/mantine`, `@blocknote/react` resolve under `packages/viewers`. (BlockNote requires React 18/19 and pulls in ProseMirror + Mantine peers automatically.)

**Step 3: Verify a bare import compiles**

- [ ] Run:

```bash
pnpm exec tsc -b
```

Expected: PASS — exits 0 (no usage yet, only dependency presence).

**Step 4: Commit**

- [ ] Run:

```bash
git add packages/viewers/package.json pnpm-lock.yaml
git commit -m "chore(viewers): add BlockNote and node-document dependencies"
```

---

## Task 9: `BlockNoteReadOnly` viewer component (used by web read-layer + sequence playback)

**Files:**
- Create: `packages/viewers/src/BlockNoteReadOnly.test.tsx`
- Create: `packages/viewers/src/BlockNoteReadOnly.tsx`
- Modify: `packages/viewers/src/index.ts` (export `BlockNoteReadOnly`)
- Modify: `apps/desktop/vitest setup` is unchanged; BlockNote needs `matchMedia` shim — handled in test file.

**Interfaces:**
- Consumes: `blockNoteJsonToMarkdown` from `@research-canvas/exporter` (Task 6); `MarkdownViewer` from `./MarkdownViewer` (existing).
- Produces: `export function BlockNoteReadOnly(props: { body: string; className?: string }): JSX.Element`. Renders a non-editable view of a BlockNote body by converting it to Markdown and delegating to the existing `MarkdownViewer` (no BlockNote editor runtime — safe for the backend-less web build per WS0 §7).

**Step 1: Write failing test**

- [ ] Create `packages/viewers/src/BlockNoteReadOnly.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BlockNoteReadOnly } from "./BlockNoteReadOnly";

describe("BlockNoteReadOnly", () => {
  it("renders a heading and paragraph from a BlockNote body", () => {
    const body = JSON.stringify([
      { type: "heading", props: { level: 1 }, content: [{ type: "text", text: "Title" }] },
      { type: "paragraph", content: [{ type: "text", text: "Body text" }] },
    ]);

    render(<BlockNoteReadOnly body={body} />);

    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(screen.getByText("Body text")).toBeInTheDocument();
  });

  it("renders nothing meaningful for an empty body without throwing", () => {
    const { container } = render(<BlockNoteReadOnly body="[]" />);
    expect(container.querySelector(".markdown-viewer")).not.toBeNull();
  });
});
```

**Step 2: Run test, expect failure**

- [ ] Run:

```bash
pnpm vitest run packages/viewers/src/BlockNoteReadOnly.test.tsx
```

Expected: FAIL — `Error: Failed to resolve import "./BlockNoteReadOnly"`.

**Step 3: Implement**

- [ ] Create `packages/viewers/src/BlockNoteReadOnly.tsx`:

```tsx
import { blockNoteJsonToMarkdown } from "@research-canvas/exporter";

import { MarkdownViewer } from "./MarkdownViewer";

interface BlockNoteReadOnlyProps {
  body: string;
  className?: string;
}

/**
 * Non-editable render of a BlockNote body. Converts to Markdown and delegates
 * to MarkdownViewer so the web read-layer needs no BlockNote editor runtime.
 * (WS0 §7)
 */
export function BlockNoteReadOnly({ body, className }: BlockNoteReadOnlyProps) {
  const markdown = blockNoteJsonToMarkdown(body);
  return (
    <div className={["blocknote-readonly", className].filter(Boolean).join(" ")}>
      <MarkdownViewer content={markdown} />
    </div>
  );
}
```

- [ ] Add `@research-canvas/exporter` to `packages/viewers/package.json` dependencies (it is consumed above):

```json
    "@research-canvas/exporter": "workspace:*",
```

(Insert alphabetically among the existing `@research-canvas/*` entries, then re-run `pnpm install`.)

- [ ] Add to `packages/viewers/src/index.ts`:

```ts
export { BlockNoteReadOnly } from "./BlockNoteReadOnly";
```

**Step 4: Run test, expect pass**

- [ ] Run:

```bash
pnpm install
pnpm vitest run packages/viewers/src/BlockNoteReadOnly.test.tsx
```

Expected: PASS — `Tests  2 passed (2)`.

**Step 5: Commit**

- [ ] Run:

```bash
git add packages/viewers/src/BlockNoteReadOnly.tsx packages/viewers/src/BlockNoteReadOnly.test.tsx packages/viewers/src/index.ts packages/viewers/package.json pnpm-lock.yaml
git commit -m "feat(viewers): add BlockNoteReadOnly markdown-backed renderer"
```

---

## Task 10: `BlockNoteDocument` editor component (the editable full page)

**Files:**
- Create: `packages/viewers/src/BlockNoteDocument.test.tsx`
- Create: `packages/viewers/src/BlockNoteDocument.tsx`
- Modify: `packages/viewers/src/index.ts` (export `BlockNoteDocument`)

**Interfaces:**
- Consumes: `isEmptyBlockNoteBody`, `EMPTY_BLOCKNOTE_DOC` from `@research-canvas/node-document` (Task 1); `@blocknote/core`, `@blocknote/react`, `@blocknote/mantine` (Task 8).
- Produces: `export function BlockNoteDocument(props: { body: string; editable?: boolean; onChange?: (body: string) => void; className?: string; saveState?: "idle" | "dirty" | "saving" | "saved" | "error"; saveErrorMessage?: string | null }): JSX.Element`. Mounts a BlockNote editor seeded from `body` (parsed block array; empty bodies start with one empty paragraph). On every document change it serialises `editor.document` to a JSON string and calls `onChange`. When `editable === false`, the editor renders read-only.
- **Visible save-failure indicator (spec §5.3 / §8 robustness bar — surface, don't just log):** when `saveState === "error"`, the component renders a visible indicator (a `role="alert"` element with class `blocknote-document__save-error` reading `"Save failed"` plus `saveErrorMessage` when present), so a failed write-back is shown to the user rather than only logged. The indicator is absent for any non-error `saveState`. `saveState`/`saveErrorMessage` map directly from the store's `status`/`errorMessage` (Task 4): the store's `"idle"` maps to the visual `"saved"`/idle (no indicator) — only `"error"` shows the indicator. This is the UI half of the WS1 bar (errors surfaced end-to-end, never swallowed); the wiring that feeds the store state through these props lives in Task 11.

**Step 1: Write failing test**

- [ ] Create `packages/viewers/src/BlockNoteDocument.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";

import { BlockNoteDocument } from "./BlockNoteDocument";

beforeAll(() => {
  // BlockNote/Mantine read matchMedia and ResizeObserver at mount; jsdom lacks both.
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
  }
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

describe("BlockNoteDocument", () => {
  it("mounts the editor and renders seeded paragraph text", async () => {
    const body = JSON.stringify([
      {
        id: "b1",
        type: "paragraph",
        props: {},
        content: [{ type: "text", text: "Seeded text", styles: {} }],
        children: [],
      },
    ]);

    render(<BlockNoteDocument body={body} editable={false} />);

    expect(await screen.findByText("Seeded text")).toBeInTheDocument();
  });

  it("mounts without throwing for an empty body", () => {
    const { container } = render(<BlockNoteDocument body="[]" editable={false} />);
    expect(container.querySelector(".blocknote-document")).not.toBeNull();
  });

  it("shows a visible save-failed indicator when saveState is 'error'", () => {
    render(
      <BlockNoteDocument
        body="[]"
        editable
        saveState="error"
        saveErrorMessage="neo4j unreachable"
      />
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("blocknote-document__save-error");
    expect(alert).toHaveTextContent(/save failed/i);
    expect(alert).toHaveTextContent("neo4j unreachable");
  });

  it("does not show the save-failed indicator when not in error", () => {
    render(<BlockNoteDocument body="[]" editable saveState="saving" />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
```

**Step 2: Run test, expect failure**

- [ ] Run:

```bash
pnpm vitest run packages/viewers/src/BlockNoteDocument.test.tsx
```

Expected: FAIL — first `Error: Failed to resolve import "./BlockNoteDocument"`; after Step 3's file exists but before the indicator markup is added, the two save-failed cases fail with `Unable to find an accessible element with the role "alert"`.

**Step 3: Implement**

- [ ] Create `packages/viewers/src/BlockNoteDocument.tsx`:

```tsx
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

import { useMemo } from "react";
import type { Block, PartialBlock } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";

import { isEmptyBlockNoteBody } from "@research-canvas/node-document";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

interface BlockNoteDocumentProps {
  body: string;
  editable?: boolean;
  onChange?: (body: string) => void;
  className?: string;
  /** Mirrors the node-document store status; drives the visible save-failure indicator. */
  saveState?: SaveState;
  /** Message shown alongside the failure indicator when saveState === "error". */
  saveErrorMessage?: string | null;
}

function parseInitialContent(body: string): PartialBlock[] | undefined {
  if (isEmptyBlockNoteBody(body)) {
    return undefined; // BlockNote seeds a single empty paragraph
  }
  try {
    const parsed = JSON.parse(body);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed as PartialBlock[];
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Editable full-page BlockNote document. Seeds from `body` (a block-array JSON
 * string) and emits the serialised document via `onChange` on every edit.
 */
export function BlockNoteDocument({
  body,
  editable = true,
  onChange,
  className,
  saveState = "idle",
  saveErrorMessage = null,
}: BlockNoteDocumentProps) {
  const initialContent = useMemo(() => parseInitialContent(body), [body]);
  const editor = useCreateBlockNote({ initialContent });

  return (
    <div className={["blocknote-document", className].filter(Boolean).join(" ")}>
      {saveState === "error" ? (
        <div className="blocknote-document__save-error" role="alert">
          <span className="blocknote-document__save-error-label">Save failed</span>
          {saveErrorMessage ? (
            <span className="blocknote-document__save-error-detail">
              {saveErrorMessage}
            </span>
          ) : null}
        </div>
      ) : null}
      <BlockNoteView
        editor={editor}
        editable={editable}
        onChange={() => {
          const doc: Block[] = editor.document;
          onChange?.(JSON.stringify(doc));
        }}
      />
    </div>
  );
}
```

- [ ] Add to `packages/viewers/src/index.ts`:

```ts
export { BlockNoteDocument } from "./BlockNoteDocument";
```

**Step 4: Run test, expect pass**

- [ ] Run:

```bash
pnpm vitest run packages/viewers/src/BlockNoteDocument.test.tsx
```

Expected: PASS — `Tests  4 passed (4)` (two mount cases plus the two save-failed-indicator cases). (If BlockNote's CSS imports break under Vitest, add `css: false` is not needed because Vitest ignores CSS imports by default; if a `.css` import errors, confirm the Vitest config has `test.css` unset, which is the default no-op.)

**Step 5: Commit**

- [ ] Run:

```bash
git add packages/viewers/src/BlockNoteDocument.tsx packages/viewers/src/BlockNoteDocument.test.tsx packages/viewers/src/index.ts
git commit -m "feat(viewers): add editable BlockNoteDocument component"
```

---

## Task 11: `NodeDocumentPane` — wire store + editor to the WS2 transport

**Files:**
- Create: `apps/desktop/src/features/viewer/NodeDocumentPane.test.tsx`
- Create: `apps/desktop/src/features/viewer/NodeDocumentPane.tsx`

**Interfaces:**
- Consumes:
  - `createNodeDocumentStore`, `NodeDocumentStore`, `NodeDocumentState` from `@research-canvas/node-document` (Task 4).
  - `BlockNoteDocument` from `@research-canvas/viewers` (Task 10).
  - WS2 transport methods (WS0 §5.2): `readGraphNode(input: { graphNodeId: string }): Promise<GraphNode>` and `updateGraphNode(input: { graphNodeId: string; patch: GraphNodePatch }): Promise<GraphNode>`; WS2 types `GraphNode`, `GraphNodePatch` from `@research-canvas/desktop-api`.
- Produces: `export function NodeDocumentPane(props: { graphNodeId: string; transport: Pick<WorkspaceTransport, "readGraphNode" | "updateGraphNode">; editable?: boolean }): JSX.Element`. On mount, calls `transport.readGraphNode({ graphNodeId })`; builds a `createNodeDocumentStore` whose `flush(body, summary)` calls `transport.updateGraphNode({ graphNodeId, patch: { body, summary } })`; renders `BlockNoteDocument` bound to the store **and forwards `store.status`/`store.errorMessage` to `BlockNoteDocument`'s `saveState`/`saveErrorMessage` props so the visible save-failure indicator (Task 10) lights up on a rejected write-back**; renders a status line reflecting `status` (`"Saving…"`, `"Saved"`, or the error message) so save failures are visible (WS1 robustness bar).
- Note: `WorkspaceTransport` is currently a non-exported interface in `packages/desktop-api/src/index.ts`. WS2 exports it (per WS0 §5.2 it adds methods to it). This task uses a structural `Pick<...>` type; if WS2 has not exported `WorkspaceTransport`, declare the prop inline as `{ readGraphNode(input: { graphNodeId: string }): Promise<GraphNode>; updateGraphNode(input: { graphNodeId: string; patch: GraphNodePatch }): Promise<GraphNode>; }` instead.
- **Save-robustness bar (spec §5.3 "same robustness bar as 5.1" — errors surfaced, never swallowed):** the `flush(body, summary)` callback `await`s `transport.updateGraphNode(...)` and does **not** wrap it in a swallowing `try/catch` — a rejection propagates out of `flush`, and `createNodeDocumentStore` (Task 4) already catches it and sets `NodeDocumentState.status = "error"` with a non-null `errorMessage`. The status line below renders that `errorMessage` **and** the failure is forwarded to `BlockNoteDocument`'s `saveState="error"` / `saveErrorMessage` props so the visible alert indicator (Task 10) shows, so a failed write-back is visibly surfaced end-to-end (no silent data loss). The store keeps `savedBody` unchanged and retains the dirty `body` on failure, so the next edit (or `flushNow`/`flushOnClose`) retries. **This bar depends on WS2's `updateGraphNode` returning a real error on failure:** WS2's Rust `GraphRepository::update_node` returns `Result<GraphNode, String>` and the `update_graph_node_command` propagates that `Err` (not an `Ok` with a sentinel), so the Tauri `invoke` rejects and `flush` rejects. If WS2's `updateGraphNode` ever resolves on a failed write (e.g. swallows the Neo4j error), this surfacing is defeated — confirm WS2 returns a genuine `Err`/rejection before relying on the status line. Do **not** add a local `catch` in `flush` that returns normally; that would re-swallow the error and break the §5.1 bar.
- **Crash-safe flush-on-close (WS1 bar (b) — mirror the layout close-flush):** `NodeDocumentBody` runs `store.getState().flushOnClose()` (Task 4A) from **both** an unmount cleanup **and** a `window` `beforeunload` listener, so the last dirty body is written when the document view closes or the window unloads. It does **not** discard the result silently: when `flushOnClose()` resolves `false` it leaves the store in `status === "error"` (so the indicator stays lit if the view is still mounted) and logs via `console.error` rather than swallowing — never a bare `void store.getState().flushNow()` whose rejection is lost. (The earlier draft's fire-and-forget `void store.getState().flushNow()` on unmount is replaced by this `flushOnClose`-based path.)

**Step 1: Write failing test**

- [ ] Create `apps/desktop/src/features/viewer/NodeDocumentPane.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { GraphNode } from "@research-canvas/desktop-api";

import { NodeDocumentPane } from "./NodeDocumentPane";

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
  }
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

function makeNode(body: string): GraphNode {
  return {
    graphNodeId: "n1",
    entityType: "Figure",
    title: "Test node",
    body,
    summary: "",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    isTemporal: true,
    validFrom: null,
    validTo: null,
    temporalPrecision: null,
    createdAt: "2026-06-28T00:00:00Z",
    updatedAt: "2026-06-28T00:00:00Z",
  };
}

describe("NodeDocumentPane", () => {
  it("reads the node body and renders it in the editor", async () => {
    const body = JSON.stringify([
      {
        id: "b1",
        type: "paragraph",
        props: {},
        content: [{ type: "text", text: "Loaded body", styles: {} }],
        children: [],
      },
    ]);
    const transport = {
      readGraphNode: vi.fn().mockResolvedValue(makeNode(body)),
      updateGraphNode: vi.fn().mockResolvedValue(makeNode(body)),
    };

    render(<NodeDocumentPane graphNodeId="n1" transport={transport} editable={false} />);

    expect(transport.readGraphNode).toHaveBeenCalledWith({ graphNodeId: "n1" });
    expect(await screen.findByText("Loaded body")).toBeInTheDocument();
  });

  it("shows an error status when the initial read fails", async () => {
    const transport = {
      readGraphNode: vi.fn().mockRejectedValue(new Error("read failed")),
      updateGraphNode: vi.fn(),
    };

    render(<NodeDocumentPane graphNodeId="n1" transport={transport} />);

    await waitFor(() =>
      expect(screen.getByText(/read failed/i)).toBeInTheDocument()
    );
  });

  it("flushes the dirty body on unmount (crash-safe close flush)", async () => {
    const body = JSON.stringify([
      {
        id: "b1",
        type: "paragraph",
        props: {},
        content: [{ type: "text", text: "Loaded body", styles: {} }],
        children: [],
      },
    ]);
    const edited = JSON.stringify([
      {
        id: "b1",
        type: "paragraph",
        props: {},
        content: [{ type: "text", text: "Edited body", styles: {} }],
        children: [],
      },
    ]);
    const transport = {
      readGraphNode: vi.fn().mockResolvedValue(makeNode(body)),
      updateGraphNode: vi.fn().mockResolvedValue(makeNode(edited)),
    };

    const { unmount } = render(
      <NodeDocumentPane graphNodeId="n1" transport={transport} __testSetBody={edited} />
    );

    // Wait for the editor to mount, then make a dirty edit that has NOT yet
    // been flushed by the debounce.
    await screen.findByText("Loaded body");
    fireEvent.click(screen.getByTestId("set-body"));

    // Closing the view must force a final write of the dirty body.
    unmount();

    await waitFor(() => expect(transport.updateGraphNode).toHaveBeenCalled());
    expect(transport.updateGraphNode).toHaveBeenLastCalledWith({
      graphNodeId: "n1",
      patch: expect.objectContaining({ body: edited }),
    });
  });

  it("surfaces a failed close flush instead of swallowing it", async () => {
    const body = JSON.stringify([
      {
        id: "b1",
        type: "paragraph",
        props: {},
        content: [{ type: "text", text: "Loaded body", styles: {} }],
        children: [],
      },
    ]);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const transport = {
      readGraphNode: vi.fn().mockResolvedValue(makeNode(body)),
      updateGraphNode: vi.fn().mockRejectedValue(new Error("close write failed")),
    };

    const edited = JSON.stringify([
      {
        id: "b1",
        type: "paragraph",
        props: {},
        content: [{ type: "text", text: "Edited body", styles: {} }],
        children: [],
      },
    ]);
    const { unmount } = render(
      <NodeDocumentPane graphNodeId="n1" transport={transport} __testSetBody={edited} />
    );
    await screen.findByText("Loaded body");
    fireEvent.click(screen.getByTestId("set-body"));

    unmount();

    await waitFor(() => expect(errorSpy).toHaveBeenCalled());
    expect(errorSpy.mock.calls.flat().join(" ")).toMatch(/close write failed/i);
    errorSpy.mockRestore();
  });
});
```

> **Note on the `set-body` helper:** the editor's BlockNote `onChange` is awkward to drive from jsdom, so the implementation (Step 3) accepts an optional test-only prop `__testSetBody?: string`; when present it renders a hidden `<button data-testid="set-body">` whose click calls `store.getState().setBody(__testSetBody)`. This prop exists purely to make the dirty-then-close path drivable under jsdom — production callers (Task 12) never pass it. The test's intent is: a dirty (un-debounced) body must be written when the view unmounts, and a failed close write must be surfaced (here via `console.error`), never silently dropped.

- [ ] Update the imports at the top of `apps/desktop/src/features/viewer/NodeDocumentPane.test.tsx` to include `fireEvent`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
```

**Step 2: Run test, expect failure**

- [ ] Run:

```bash
pnpm vitest run apps/desktop/src/features/viewer/NodeDocumentPane.test.tsx
```

Expected: FAIL — `Error: Failed to resolve import "./NodeDocumentPane"`.

**Step 3: Implement**

- [ ] Create `apps/desktop/src/features/viewer/NodeDocumentPane.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";

import {
  createNodeDocumentStore,
  type NodeDocumentStore,
} from "@research-canvas/node-document";
import { BlockNoteDocument } from "@research-canvas/viewers";
import type { GraphNode, GraphNodePatch } from "@research-canvas/desktop-api";

interface NodeDocumentTransport {
  readGraphNode(input: { graphNodeId: string }): Promise<GraphNode>;
  updateGraphNode(input: {
    graphNodeId: string;
    patch: GraphNodePatch;
  }): Promise<GraphNode>;
}

interface NodeDocumentPaneProps {
  graphNodeId: string;
  transport: NodeDocumentTransport;
  editable?: boolean;
  /**
   * Test-only: when set, renders a hidden button that pushes this body via
   * setBody so jsdom tests can drive a dirty-then-close flush. Never passed by
   * production callers.
   */
  __testSetBody?: string;
}

export function NodeDocumentPane({
  graphNodeId,
  transport,
  editable = true,
  __testSetBody,
}: NodeDocumentPaneProps) {
  const [store, setStore] = useState<NodeDocumentStore | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const transportRef = useRef(transport);
  transportRef.current = transport;

  useEffect(() => {
    let cancelled = false;
    setStore(null);
    setLoadError(null);

    transportRef.current
      .readGraphNode({ graphNodeId })
      .then((node) => {
        if (cancelled) {
          return;
        }
        const nextStore = createNodeDocumentStore({
          graphNodeId,
          initialBody: node.body,
          flush: async (body, summary) => {
            await transportRef.current.updateGraphNode({
              graphNodeId,
              patch: { body, summary } as GraphNodePatch,
            });
          },
        });
        setStore(nextStore);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setLoadError(
          error instanceof Error ? error.message : "failed to read node"
        );
      });

    return () => {
      cancelled = true;
    };
  }, [graphNodeId]);

  if (loadError) {
    return (
      <div className="node-document-pane node-document-pane--error" role="alert">
        {loadError}
      </div>
    );
  }

  if (!store) {
    return <div className="node-document-pane node-document-pane--loading">Loading…</div>;
  }

  return (
    <NodeDocumentBody store={store} editable={editable} testSetBody={__testSetBody} />
  );
}

function NodeDocumentBody({
  store,
  editable,
  testSetBody,
}: {
  store: NodeDocumentStore;
  editable: boolean;
  testSetBody?: string;
}) {
  const body = useStore(store, (state) => state.body);
  const status = useStore(store, (state) => state.status);
  const errorMessage = useStore(store, (state) => state.errorMessage);

  // Crash-safe flush-on-close (WS1 robustness bar (b)): write the dirty body on
  // window unload AND on unmount, and SURFACE failure rather than dropping it.
  useEffect(() => {
    const closeFlush = () => {
      void store
        .getState()
        .flushOnClose()
        .then((ok) => {
          if (!ok) {
            // flushOnClose already set status="error"/errorMessage on the store;
            // also log so a failure during teardown is never silently lost.
            console.error(
              "node-document close flush failed:",
              store.getState().errorMessage
            );
          }
        });
    };
    window.addEventListener("beforeunload", closeFlush);
    return () => {
      window.removeEventListener("beforeunload", closeFlush);
      closeFlush();
    };
  }, [store]);

  return (
    <div className="node-document-pane">
      <BlockNoteDocument
        body={body}
        editable={editable}
        saveState={status}
        saveErrorMessage={errorMessage}
        onChange={(next) => store.getState().setBody(next)}
      />
      <div className="node-document-pane__status" data-status={status}>
        {status === "saving"
          ? "Saving…"
          : status === "error"
            ? (errorMessage ?? "Save failed")
            : status === "dirty"
              ? "Unsaved changes"
              : "Saved"}
      </div>
      {testSetBody !== undefined ? (
        <button
          type="button"
          data-testid="set-body"
          style={{ display: "none" }}
          onClick={() => store.getState().setBody(testSetBody)}
        >
          set body (test only)
        </button>
      ) : null}
    </div>
  );
}
```

**Step 4: Run test, expect pass**

- [ ] Run:

```bash
pnpm vitest run apps/desktop/src/features/viewer/NodeDocumentPane.test.tsx
```

Expected: PASS — `Tests  4 passed (4)` (read+render, read-failure status, dirty-body close flush, and surfaced close-flush failure).

**Step 5: Commit**

- [ ] Run:

```bash
git add apps/desktop/src/features/viewer/NodeDocumentPane.tsx apps/desktop/src/features/viewer/NodeDocumentPane.test.tsx
git commit -m "feat(desktop): NodeDocumentPane wiring store+editor to graph transport with crash-safe close flush + surfaced save errors"
```

---

## Task 12: Surface the document page in the Content tab and FullScreenReader

**Files:**
- Modify: `apps/desktop/src/features/viewer/ContentTab.tsx` (render `NodeDocumentPane` when the selected node maps to a graph node)
- Modify: `apps/desktop/src/layout/FullScreenReader.tsx` (`NodeMode` renders `NodeDocumentPane` for graph-backed nodes)
- Create: `apps/desktop/src/features/viewer/ContentTab.graphdoc.test.tsx`

**Interfaces:**
- Consumes:
  - `NodeDocumentPane` (Task 11).
  - `useCanvasWorkspace()` from `apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx` (existing). The selected node id is `workspace.selectedNodeId`; the WS2-migrated workspace exposes the transport instance. **WS2 dependency:** WS2 adds the joined `GraphNode`-backed nodes and exposes the transport. For this task, expose the transport via the workspace context value as `workspace.transport` (WS2 adds it) OR import `createWorkspaceTransport` from `@research-canvas/desktop-api` and call `readGraphNode`/`updateGraphNode` directly. This task uses `createWorkspaceTransport()` so it does not block on WS2 changing the context shape; the graph node id is the selected node's `graphNodeId` (WS2 nodes carry it; pre-WS2 `CanvasNode.id` is used as a fallback only in the test).
- Produces: nothing new; integrates the pane into the two surfaces.

**Step 1: Write failing test**

- [ ] Create `apps/desktop/src/features/viewer/ContentTab.graphdoc.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { GraphDocumentContent } from "./ContentTab";

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
  }
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

describe("GraphDocumentContent", () => {
  it("renders the node document for a graph node id", async () => {
    const body = JSON.stringify([
      {
        id: "b1",
        type: "paragraph",
        props: {},
        content: [{ type: "text", text: "Graph body", styles: {} }],
        children: [],
      },
    ]);
    const transport = {
      readGraphNode: vi.fn().mockResolvedValue({
        graphNodeId: "g1",
        entityType: "Figure",
        title: "T",
        body,
        summary: "",
        archetypalResonance: null,
        coordinate: null,
        sourceCoordinates: [],
        isTemporal: true,
        validFrom: null,
        validTo: null,
        temporalPrecision: null,
        createdAt: "2026-06-28T00:00:00Z",
        updatedAt: "2026-06-28T00:00:00Z",
      }),
      updateGraphNode: vi.fn(),
    };

    render(<GraphDocumentContent graphNodeId="g1" transport={transport} />);

    expect(await screen.findByText("Graph body")).toBeInTheDocument();
  });
});
```

**Step 2: Run test, expect failure**

- [ ] Run:

```bash
pnpm vitest run apps/desktop/src/features/viewer/ContentTab.graphdoc.test.tsx
```

Expected: FAIL — `ContentTab.tsx` does not export `GraphDocumentContent`; `The requested module './ContentTab' does not provide an export named 'GraphDocumentContent'`.

**Step 3: Implement**

- [ ] Add to `apps/desktop/src/features/viewer/ContentTab.tsx` a new exported wrapper (append after the existing `ContentTab` component):

```tsx
import { NodeDocumentPane } from "./NodeDocumentPane";
import type { GraphNode, GraphNodePatch } from "@research-canvas/desktop-api";

interface GraphDocumentTransport {
  readGraphNode(input: { graphNodeId: string }): Promise<GraphNode>;
  updateGraphNode(input: {
    graphNodeId: string;
    patch: GraphNodePatch;
  }): Promise<GraphNode>;
}

export function GraphDocumentContent({
  graphNodeId,
  transport,
  editable = true,
}: {
  graphNodeId: string;
  transport: GraphDocumentTransport;
  editable?: boolean;
}) {
  return (
    <NodeDocumentPane
      graphNodeId={graphNodeId}
      transport={transport}
      editable={editable}
    />
  );
}
```

- [ ] Update `apps/desktop/src/features/viewer/ContentTab.tsx`'s `ContentTab` body so that when the selected node carries a `graphNodeId` (WS2-joined node), it renders `GraphDocumentContent` instead of the legacy `NodeContentPane`. Replace the final `return (...)` of `ContentTab` with:

```tsx
  const graphNodeId =
    (node as unknown as { graphNodeId?: string }).graphNodeId ?? null;

  if (graphNodeId) {
    return (
      <GraphDocumentContent
        graphNodeId={graphNodeId}
        transport={createWorkspaceTransport() as unknown as GraphDocumentTransport}
      />
    );
  }

  return (
    <NodeContentPane
      node={node}
      textContent={textContent}
      onFullScreen={onFullScreen}
      onNoteContentChange={(content) => workspace.updateNodeContent(node.id, content)}
    />
  );
```

- [ ] Add the import for the transport factory at the top of `apps/desktop/src/features/viewer/ContentTab.tsx` (modify the existing `@research-canvas/desktop-api` import line):

```tsx
import { createWorkspaceTransport, readWorkspaceTextFile } from "@research-canvas/desktop-api";
```

- [ ] Mirror the same branch in `apps/desktop/src/layout/FullScreenReader.tsx`'s `NodeMode`: before the legacy `return`, add (using the existing `node` variable):

```tsx
  const graphNodeId = (node as unknown as { graphNodeId?: string }).graphNodeId ?? null;
  if (graphNodeId) {
    return (
      <div className="fullscreen-reader">
        <header className="fullscreen-reader__header">
          <nav className="fullscreen-reader__breadcrumb">
            <span>{workspace.activeProject?.displayName ?? "Project"}</span>
            <span className="fsr-sep">&rsaquo;</span>
            <span>Canvas</span>
            <span className="fsr-sep">&rsaquo;</span>
            <span className="fsr-current">{node.title}</span>
          </nav>
          <button className="fullscreen-reader__close" onClick={onClose} title="Back to canvas (Esc)">&larr; Back</button>
        </header>
        <main className="fullscreen-reader__body">
          <NodeDocumentPane
            graphNodeId={graphNodeId}
            transport={createWorkspaceTransport() as unknown as {
              readGraphNode: (input: { graphNodeId: string }) => Promise<GraphNode>;
              updateGraphNode: (input: { graphNodeId: string; patch: GraphNodePatch }) => Promise<GraphNode>;
            }}
          />
        </main>
      </div>
    );
  }
```

- [ ] Add the needed imports at the top of `apps/desktop/src/layout/FullScreenReader.tsx`:

```tsx
import { createWorkspaceTransport, readWorkspaceTextFile } from "@research-canvas/desktop-api";
import type { GraphNode, GraphNodePatch } from "@research-canvas/desktop-api";
import { NodeDocumentPane } from "../features/viewer/NodeDocumentPane";
```

(Replace the existing `import { readWorkspaceTextFile } from "@research-canvas/desktop-api";` line with the first line above; add the other two.)

**Step 4: Run test, expect pass**

- [ ] Run:

```bash
pnpm vitest run apps/desktop/src/features/viewer/ContentTab.graphdoc.test.tsx
```

Expected: PASS — `Tests  1 passed (1)`.

- [ ] Run the existing reader/content tests to confirm no regression:

```bash
pnpm vitest run apps/desktop/src/features/viewer/NodeContentPane.test.tsx
```

Expected: PASS — existing tests still green.

**Step 5: Commit**

- [ ] Run:

```bash
git add apps/desktop/src/features/viewer/ContentTab.tsx apps/desktop/src/layout/FullScreenReader.tsx apps/desktop/src/features/viewer/ContentTab.graphdoc.test.tsx
git commit -m "feat(desktop): render BlockNote node document in Content tab and full-screen reader"
```

---

## Task 13: Full-package type-check + full test sweep

**Files:**
- None (verification task).

**Interfaces:**
- Consumes: all prior tasks.
- Produces: green build evidence.

**Step 1: Type-check the whole workspace**

- [ ] Run:

```bash
pnpm exec tsc -b
```

Expected: PASS — exits 0, no diagnostics across `packages/node-document`, `packages/viewers`, `packages/exporter`, `apps/desktop`.

**Step 2: Run the WS3 frontend tests together**

- [ ] Run:

```bash
pnpm vitest run packages/node-document packages/exporter/src/blockNoteMarkdown.test.ts packages/viewers/src/BlockNoteReadOnly.test.tsx packages/viewers/src/BlockNoteDocument.test.tsx apps/desktop/src/features/viewer/NodeDocumentPane.test.tsx apps/desktop/src/features/viewer/ContentTab.graphdoc.test.tsx
```

Expected: PASS — all WS3 suites green (node-document 23 tests, exporter 10, viewers 6, desktop 5).

**Step 3: Run the full frontend test suite (regression guard)**

- [ ] Run:

```bash
pnpm vitest run
```

Expected: PASS — no previously-green suite turns red.

**Step 4: Commit (no-op safety / lockfile)**

- [ ] Run:

```bash
git add -A
git commit -m "chore(ws3): verify type-check and full test sweep green" --allow-empty
```

---

## Done When

- [ ] `packages/node-document` exists and exports `EMPTY_BLOCKNOTE_DOC`, `isEmptyBlockNoteBody`, `normaliseBlockNoteBody`, `blockNoteSummary`, `createNodeDocumentStore`, `NodeDocumentState`, `NodeDocumentStore`; all its unit tests pass (Tasks 1–4, 4A).
- [ ] `createNodeDocumentStore` debounces edits, serialises concurrent flushes, and sets `status === "error"` with a non-null `errorMessage` when the flush rejects — never swallowing the error — while **retaining the dirty `body`** so the edit is not lost and the next `setBody`/`flushNow`/`flushOnClose` retries it (WS1 robustness bar; spec §5.3 "same robustness bar as 5.1") (Task 4).
- [ ] `createNodeDocumentStore` exposes `flushOnClose(): Promise<boolean>` — a crash-safe final write of the dirty body that cancels the pending debounce, resolves `true` only when clean or durably saved, and on a failed final write resolves `false` **and** sets `status === "error"` + `errorMessage` (never a silent `return false`) while retaining the dirty body (mirrors WS1's crash-safe flush) (Task 4A).
- [ ] `packages/exporter` exports `blockNoteJsonToMarkdown` and `markdownToBlockNoteJson` matching the WS0 §7 signatures, with passing tests for headings, inline styles, lists, images, quotes, code blocks, and the empty case (Tasks 6–7).
- [ ] `packages/viewers` exports `BlockNoteDocument` (editable, slash menu / drag handles / native image blocks via BlockNote; renders a visible `role="alert"` `.blocknote-document__save-error` indicator when `saveState === "error"`) and `BlockNoteReadOnly` (markdown-backed, no editor runtime for the web read-layer); both mount under Vitest/jsdom without throwing (Tasks 9–10).
- [ ] `NodeDocumentPane` reads a node body via `readGraphNode`, edits flow back through `updateGraphNode({ graphNodeId, patch: { body, summary } })`, the on-screen status line shows Saving/Saved/Unsaved/error, and the store's error state is forwarded to `BlockNoteDocument`'s `saveState`/`saveErrorMessage` so a failed write-back shows a visible save-failed indicator end-to-end; it also runs `flushOnClose` on unmount **and** `window` `beforeunload`, surfacing (not swallowing) a failed close write (Task 11).
- [ ] Selecting a graph-backed node and opening it (Content tab or full-screen) shows the full BlockNote page; the same `graphNodeId` opens the identical document from canvas and timeline (spec §5.3 "Compact … ↔ full page"; WS0 §8 "same `GraphNode`") (Task 12).
- [ ] `pnpm exec tsc -b` exits 0 and `pnpm vitest run` is fully green (Task 13).
