# Web Read-Layer + Repo/Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the web build a backend-less read/display layer over the two-store data model. The desktop static export serializes Neo4j (theory substance) **joined with** SQLite (layout) into a self-contained `GraphExportBundle` JSON dataset; the `public-viewer` web app reads that dataset with **no backend** and renders both lenses (canvas read-only + timeline) and archetypal lighting through the **same** `WorkspaceTransport` read interface (`createStaticBundleTransport`). The hosted read-only Neo4j path is kept open behind the same interface but is not built in v1. Also: write clean repo docs (setup, architecture, data model/ontology) and fix the stale `CLAUDE.md` that wrongly says "not yet implemented".

**Architecture:** A new `GraphExportBundle` type (substance + layout + relationships + lighting index) is produced by a new exporter module `packages/exporter/src/graphBundle.ts`. A new `blockNoteJsonToMarkdown` / `markdownToBlockNoteJson` pair in `packages/exporter/src/renderMarkdown.ts` (contracts §7) converts node bodies for the backend-less viewer. `packages/desktop-api/src/index.ts` gains a `createStaticBundleTransport(bundle)` factory implementing the read methods of `WorkspaceTransport` (contracts §5.2/§5.3) directly against an in-memory `GraphExportBundle`, and throwing `Error("read-only web build")` on every mutation method. The `public-viewer` app loads the bundle and renders canvas/timeline read-only views from it. The desktop side adds a Rust serializer (`export/graph_bundle.rs`) that joins `GraphRepository` substance with `LayoutRepository` layout into the same JSON shape, plus a Tauri command `export_graph_bundle_command`. Docs land under `docs/` and the repo root.

**Tech Stack:** Tauri v2; React 19 + Vite 7 + TypeScript 5.9; pnpm monorepo; XYFlow @xyflow/react v12.8.5; Zustand v5 vanilla stores; Vitest 3; Rust (`neo4rs` + `rusqlite`); test-first (TDD).

## Global Constraints

Tauri v2; React 19 + Vite 7 + TypeScript 5.9; pnpm monorepo; XYFlow @xyflow/react v12.8.5; Zustand v5 vanilla stores; test-first (TDD) for every backend repository, frontend state model, and export behavior; prefer REAL integration tests (real SQLite in temp dir, real Neo4j against an ephemeral/docker instance, real fixture filesystem) over mocks; ALWAYS run Rust tests with `--test-threads=1`; keep file/folder/package names per the repo's existing conventions.

---

## Workstream dependencies (declared once, used throughout)

This workstream (WS7) reads from, but does not implement, the following shared contracts (`docs/superpowers/plans/2026-06-28-ws0-contracts-and-architecture.md`). Each task's **Interfaces → Consumes** block references the exact signatures below.

- **WS0 contracts §5.1 (TypeScript shared types):** `EntityType`, `GraphNode`, `GraphRelationship`, `NodeLayout`, `EdgeLayout`, `JoinedCanvasNode`, `CanvasView`, `LitInstance`, `ArchetypalLighting`, `NewGraphNodeInput`, `GraphNodePatch`. WS7 **defines** these in `packages/desktop-api/src/index.ts` if WS2 has not already (Task 3 below adds them idempotently; if WS2 landed them first, reuse verbatim).
- **WS0 contracts §5.2 (`WorkspaceTransport` methods):** read methods `readGraphNode`, `searchGraph`, `loadCanvasView({ canvasId, lens })`, `archetypalLighting({ operatorGraphNodeId })`, `resonancesForInstance({ graphNodeId })`; mutation methods (must throw in web build) `createGraphNode`, `updateGraphNode`, `deleteGraphNode`, `connectGraphNodes`, `disconnectGraphNodes`, all `upsert*`, `flushCanvasLayout`.
- **WS2 (Rust data layer) §4.2:** `GraphRepository::new(graph: SharedGraph, database: String)`, `GraphRepository::list_nodes_for_lens(lens: &str) -> Result<Vec<GraphNode>, String>`, `GraphRepository::list_relationships() -> Result<Vec<GraphRelationship>, String>`, `GraphRepository::archetypal_lighting(operator_graph_node_id: &str) -> Result<ArchetypalLightingResult, String>`. WS7 consumes these in the Rust serializer (Task 8). If WS2 has not yet landed `GraphRepository`, Task 8 is gated on it; Tasks 1–7 (the TS web read-layer, which is the v1-critical path) do **not** depend on WS2 because they run against an in-memory bundle fixture.
- **WS2 §4.3:** `LayoutRepository::new(connection: &rusqlite::Connection)`, `LayoutRepository::list_node_layout(canvas_id: &str) -> rusqlite::Result<Vec<NodeLayoutRecord>>`, `LayoutRepository::list_edge_layout(canvas_id: &str) -> rusqlite::Result<Vec<EdgeLayoutRecord>>`, `LayoutRepository::get_app_state(canvas_id: &str) -> rusqlite::Result<Option<CanvasAppStateRecord>>`.
- **WS1 (saving) §4.3:** the transactional layout-write pattern. WS7 only **reads** layout, so it consumes WS1's `NodeLayoutRecord`/`EdgeLayoutRecord`/`CanvasAppStateRecord` shapes (contracts §4.3) but does not write them.

**Build order within WS7:** Tasks 1–7 (TS bundle type, markdown conversion, static-bundle transport, viewer wiring) are independent of the Rust layer and deliver the v1 read-layer against a fixture. Task 8 (Rust serializer) and Task 9 (Tauri command) wire the live desktop export and depend on WS2. Tasks 10–13 are docs and the `CLAUDE.md` fix (no code deps).

---

## Task 1 — `GraphExportBundle` type + Zod schema

The self-contained dataset the web build reads with no backend. It carries substance (graph nodes + relationships), layout (per-canvas node/edge layout + viewport/app-state), and a precomputed archetypal-lighting index so the read-only viewer can light the timeline without a query engine.

**Files:**
- Create: `packages/exporter/src/graphBundle.ts`
- Create: `packages/exporter/src/graphBundle.test.ts`

**Interfaces:**
- Consumes: WS0 §5.1 TS types `GraphNode`, `GraphRelationship`, `NodeLayout`, `EdgeLayout`, `LitInstance` — defined in `packages/desktop-api/src/index.ts` (Task 3 ensures they exist; for this task they are imported as type-only via the `@research-canvas/desktop-api` alias, which already exists in `vitest.config.ts` and `tsconfig.base.json`). If Task 3 has not run yet in your session, run Task 3 first — Task 1's test imports these types.
- Produces:
  - `interface GraphExportBundle { generatedAt: string; project: ExportBundle["project"]; canvasId: string; nodes: GraphNode[]; relationships: GraphRelationship[]; nodeLayout: NodeLayout[]; edgeLayout: EdgeLayout[]; viewport: { x: number; y: number; zoom: number }; appState: Record<string, unknown>; lightingIndex: Record<string, LitInstance[]>; assets: ExportAsset[]; }`
  - `const graphExportBundleSchema: z.ZodType<GraphExportBundle>`
  - `function parseGraphExportBundle(value: unknown): GraphExportBundle`

**Steps:**

- [ ] 1.1 Add `desktop-api` and `zod` as dependencies of the exporter package. Edit `packages/exporter/package.json` `dependencies` block from:
  ```json
  "dependencies": {
    "@research-canvas/schema": "workspace:*"
  }
  ```
  to:
  ```json
  "dependencies": {
    "@research-canvas/desktop-api": "workspace:*",
    "@research-canvas/schema": "workspace:*",
    "zod": "^3.23.8"
  }
  ```
  Then run:
  ```bash
  pnpm install
  ```
  Expected output: pnpm resolves the workspace link and prints `Done` with no `ERR_PNPM` lines.

- [ ] 1.2 Add the `desktop-api` reference to the exporter tsconfig so type-only imports resolve. Edit `packages/exporter/tsconfig.json` `references` from:
  ```json
  "references": [
    {
      "path": "../schema"
    }
  ]
  ```
  to:
  ```json
  "references": [
    {
      "path": "../schema"
    },
    {
      "path": "../desktop-api"
    }
  ]
  ```

- [ ] 1.3 Write the failing test. Create `packages/exporter/src/graphBundle.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";

  import { graphExportBundleSchema, parseGraphExportBundle } from "./graphBundle";
  import type { GraphExportBundle } from "./graphBundle";

  function makeBundle(): GraphExportBundle {
    return {
      generatedAt: "2026-06-28T12:00:00Z",
      project: {
        coverAssetPath: null,
        createdAt: "2026-06-28T12:00:00Z",
        displayName: "Antichrist",
        id: "11111111-1111-4111-8111-111111111111",
        parentProjectId: null,
        primaryCanvasId: "22222222-2222-4222-8222-222222222222",
        publishSettings: {
          includeResources: true,
          mobileSequenceFirst: true,
          theme: "paper"
        },
        rootPath: "/tmp/antichrist",
        slug: "antichrist",
        summary: "Theory graph",
        updatedAt: "2026-06-28T12:00:00Z"
      },
      canvasId: "22222222-2222-4222-8222-222222222222",
      nodes: [
        {
          graphNodeId: "node-monopoly",
          entityType: "Dynamic",
          title: "Monopoly mechanism",
          body: "[]",
          summary: "trans-temporal pattern",
          archetypalResonance: null,
          coordinate: null,
          sourceCoordinates: [],
          isTemporal: false,
          validFrom: null,
          validTo: null,
          temporalPrecision: null,
          createdAt: "2026-06-28T12:00:00Z",
          updatedAt: "2026-06-28T12:00:00Z"
        },
        {
          graphNodeId: "node-banda",
          entityType: "Event",
          title: "Banda genocide",
          body: "[]",
          summary: "1621",
          archetypalResonance: null,
          coordinate: null,
          sourceCoordinates: [],
          isTemporal: true,
          validFrom: "1621-01-01",
          validTo: "1621-12-31",
          temporalPrecision: "year",
          createdAt: "2026-06-28T12:00:00Z",
          updatedAt: "2026-06-28T12:00:00Z"
        }
      ],
      relationships: [
        {
          id: "rel-1",
          relType: "INSTANTIATES",
          sourceGraphNodeId: "node-banda",
          targetGraphNodeId: "node-monopoly",
          properties: { dominance: "dominant" }
        }
      ],
      nodeLayout: [
        {
          graphNodeId: "node-monopoly",
          canvasId: "22222222-2222-4222-8222-222222222222",
          positionX: 10,
          positionY: 20,
          width: 240,
          height: 160,
          style: {}
        }
      ],
      edgeLayout: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      appState: {},
      lightingIndex: {
        "node-monopoly": [
          {
            node: {
              graphNodeId: "node-banda",
              entityType: "Event",
              title: "Banda genocide",
              body: "[]",
              summary: "1621",
              archetypalResonance: null,
              coordinate: null,
              sourceCoordinates: [],
              isTemporal: true,
              validFrom: "1621-01-01",
              validTo: "1621-12-31",
              temporalPrecision: "year",
              createdAt: "2026-06-28T12:00:00Z",
              updatedAt: "2026-06-28T12:00:00Z"
            },
            relType: "INSTANTIATES",
            dominance: "dominant"
          }
        ]
      },
      assets: []
    };
  }

  describe("graphExportBundle", () => {
    it("accepts a well-formed bundle and round-trips through parse", () => {
      const bundle = makeBundle();
      const parsed = parseGraphExportBundle(bundle);
      expect(parsed.canvasId).toBe("22222222-2222-4222-8222-222222222222");
      expect(parsed.nodes).toHaveLength(2);
      expect(parsed.lightingIndex["node-monopoly"]?.[0]?.relType).toBe("INSTANTIATES");
    });

    it("rejects a bundle whose node is missing graphNodeId", () => {
      const broken = makeBundle();
      // @ts-expect-error intentionally remove a required field for the test
      delete broken.nodes[0].graphNodeId;
      expect(() => parseGraphExportBundle(broken)).toThrow();
      expect(graphExportBundleSchema.safeParse(broken).success).toBe(false);
    });
  });
  ```

- [ ] 1.4 Run the test, expect FAIL:
  ```bash
  pnpm vitest run packages/exporter/src/graphBundle.test.ts
  ```
  Expected output: failure with `Failed to resolve import "./graphBundle"` (module does not exist yet).

- [ ] 1.5 Create `packages/exporter/src/graphBundle.ts` with the real implementation:
  ```ts
  import { z } from "zod";

  import type { ExportAsset, ExportBundle } from "@research-canvas/schema";
  import { projectSchema } from "@research-canvas/schema";
  import type {
    EdgeLayout,
    GraphNode,
    GraphRelationship,
    LitInstance,
    NodeLayout
  } from "@research-canvas/desktop-api";

  export interface GraphExportBundle {
    generatedAt: string;
    project: ExportBundle["project"];
    canvasId: string;
    nodes: GraphNode[];
    relationships: GraphRelationship[];
    nodeLayout: NodeLayout[];
    edgeLayout: EdgeLayout[];
    viewport: { x: number; y: number; zoom: number };
    appState: Record<string, unknown>;
    /** operatorGraphNodeId -> lit datable instances (precomputed for the backend-less viewer). */
    lightingIndex: Record<string, LitInstance[]>;
    assets: ExportAsset[];
  }

  const entityTypeSchema = z.enum([
    "Figure",
    "People",
    "Event",
    "Institution",
    "Source",
    "Place",
    "Work",
    "Archetype",
    "Dynamic",
    "PsychoidOperator"
  ]);

  const temporalPrecisionSchema = z
    .enum(["year", "month", "day", "decade", "century", "millennium"])
    .nullable();

  const graphNodeSchema: z.ZodType<GraphNode> = z.object({
    graphNodeId: z.string().min(1),
    entityType: entityTypeSchema,
    title: z.string(),
    body: z.string(),
    summary: z.string(),
    archetypalResonance: z.string().nullable(),
    coordinate: z.string().nullable(),
    sourceCoordinates: z.array(z.string()),
    isTemporal: z.boolean(),
    validFrom: z.string().nullable(),
    validTo: z.string().nullable(),
    temporalPrecision: temporalPrecisionSchema,
    createdAt: z.string(),
    updatedAt: z.string()
  });

  const graphRelationshipSchema: z.ZodType<GraphRelationship> = z.object({
    id: z.string().min(1),
    relType: z.string().min(1),
    sourceGraphNodeId: z.string().min(1),
    targetGraphNodeId: z.string().min(1),
    properties: z.record(z.unknown())
  });

  const nodeLayoutSchema: z.ZodType<NodeLayout> = z.object({
    graphNodeId: z.string().min(1),
    canvasId: z.string().min(1),
    positionX: z.number(),
    positionY: z.number(),
    width: z.number(),
    height: z.number(),
    style: z.object({
      dotColour: z.string().optional(),
      bgColour: z.string().optional(),
      textColour: z.string().optional(),
      thumbnail: z.string().optional()
    })
  });

  const edgeLayoutSchema: z.ZodType<EdgeLayout> = z.object({
    id: z.string().min(1),
    canvasId: z.string().min(1),
    sourceGraphNodeId: z.string().min(1),
    targetGraphNodeId: z.string().min(1),
    relationKind: z.string(),
    sourceHandleId: z.string().optional(),
    targetHandleId: z.string().optional(),
    style: z.object({
      stroke: z.string().optional(),
      width: z.number().optional(),
      dashed: z.boolean().optional()
    })
  });

  const litInstanceSchema: z.ZodType<LitInstance> = z.object({
    node: graphNodeSchema,
    relType: z.enum(["INSTANTIATES", "ECHOES"]),
    dominance: z.enum(["dominant", "secondary"]).nullable()
  });

  const exportAssetSchema: z.ZodType<ExportAsset> = z.object({
    nodeId: z.string(),
    sourcePath: z.string().min(1),
    relativePath: z.string().min(1),
    downloadName: z.string().min(1),
    mimeType: z.string().min(1)
  });

  export const graphExportBundleSchema: z.ZodType<GraphExportBundle> = z.object({
    generatedAt: z.string(),
    project: projectSchema,
    canvasId: z.string().min(1),
    nodes: z.array(graphNodeSchema),
    relationships: z.array(graphRelationshipSchema),
    nodeLayout: z.array(nodeLayoutSchema),
    edgeLayout: z.array(edgeLayoutSchema),
    viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number() }),
    appState: z.record(z.unknown()),
    lightingIndex: z.record(z.array(litInstanceSchema)),
    assets: z.array(exportAssetSchema)
  });

  export function parseGraphExportBundle(value: unknown): GraphExportBundle {
    return graphExportBundleSchema.parse(value);
  }
  ```

- [ ] 1.6 Run the test, expect PASS:
  ```bash
  pnpm vitest run packages/exporter/src/graphBundle.test.ts
  ```
  Expected output: `2 passed`.

- [ ] 1.7 Commit:
  ```bash
  git add packages/exporter/package.json packages/exporter/tsconfig.json packages/exporter/src/graphBundle.ts packages/exporter/src/graphBundle.test.ts pnpm-lock.yaml
  git commit -m "feat(exporter): GraphExportBundle type + zod schema for backend-less web read-layer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 2 — `blockNoteJsonToMarkdown` + `markdownToBlockNoteJson` (contracts §7)

The static export serializes each node `body` (BlockNote/ProseMirror JSON string) to Markdown so the backend-less web viewer can render theory without a BlockNote editor runtime. Contracts §7 names both functions; this task implements them next to the existing `renderMarkdownToHtml` so the same file owns markdown interop.

**Files:**
- Modify: `packages/exporter/src/renderMarkdown.ts` (append two new exports after the existing `renderMarkdownToHtml`, end of file before the bottom `escapeHtml` helper at lines 180–182; add new code at the top-level, do not alter `renderMarkdownToHtml`)
- Create: `packages/exporter/src/blockNoteMarkdown.test.ts`

**Interfaces:**
- Consumes: nothing external (operates on the BlockNote block-array JSON shape defined by contracts §7: `body` is the literal `"[]"` for empty, otherwise a JSON array of blocks `{ type, props?, content?: Array<{ type: "text"; text: string }> }`).
- Produces:
  - `function blockNoteJsonToMarkdown(bodyJson: string): string`
  - `function markdownToBlockNoteJson(markdown: string): string`

**Steps:**

- [ ] 2.1 Write the failing test. Create `packages/exporter/src/blockNoteMarkdown.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";

  import {
    blockNoteJsonToMarkdown,
    markdownToBlockNoteJson
  } from "./renderMarkdown";

  describe("blockNoteJsonToMarkdown", () => {
    it("returns empty string for the empty-doc sentinels", () => {
      expect(blockNoteJsonToMarkdown("")).toBe("");
      expect(blockNoteJsonToMarkdown("[]")).toBe("");
    });

    it("renders headings, paragraphs, bullet lists, and images", () => {
      const body = JSON.stringify([
        { type: "heading", props: { level: 1 }, content: [{ type: "text", text: "Title" }] },
        { type: "paragraph", content: [{ type: "text", text: "Body text" }] },
        { type: "bulletListItem", content: [{ type: "text", text: "first" }] },
        { type: "bulletListItem", content: [{ type: "text", text: "second" }] },
        { type: "image", props: { url: "assets/node-1/x.png", caption: "fig" } }
      ]);

      const markdown = blockNoteJsonToMarkdown(body);
      expect(markdown).toContain("# Title");
      expect(markdown).toContain("Body text");
      expect(markdown).toContain("- first");
      expect(markdown).toContain("- second");
      expect(markdown).toContain("![fig](assets/node-1/x.png)");
    });

    it("treats malformed JSON as empty rather than throwing", () => {
      expect(blockNoteJsonToMarkdown("not json")).toBe("");
    });
  });

  describe("markdownToBlockNoteJson", () => {
    it("converts a heading and paragraph into BlockNote blocks", () => {
      const json = markdownToBlockNoteJson("# Title\n\nBody text");
      const blocks = JSON.parse(json) as Array<{
        type: string;
        props?: { level?: number };
        content?: Array<{ type: string; text: string }>;
      }>;
      expect(blocks[0].type).toBe("heading");
      expect(blocks[0].props?.level).toBe(1);
      expect(blocks[0].content?.[0]?.text).toBe("Title");
      expect(blocks[1].type).toBe("paragraph");
      expect(blocks[1].content?.[0]?.text).toBe("Body text");
    });

    it("returns the empty-doc sentinel for empty markdown", () => {
      expect(markdownToBlockNoteJson("")).toBe("[]");
      expect(markdownToBlockNoteJson("   \n  ")).toBe("[]");
    });
  });
  ```

- [ ] 2.2 Run the test, expect FAIL:
  ```bash
  pnpm vitest run packages/exporter/src/blockNoteMarkdown.test.ts
  ```
  Expected output: failure with `blockNoteJsonToMarkdown is not a function` (or an import-resolution error for the missing export).

- [ ] 2.3 Implement the two functions. Open `packages/exporter/src/renderMarkdown.ts` and insert the following at the **top of the file**, immediately after the existing `HTML_ESCAPE_LOOKUP` constant block (after line 7, before `export function renderMarkdownToHtml`):
  ```ts
  interface BlockNoteInline {
    type: string;
    text?: string;
  }

  interface BlockNoteBlock {
    type: string;
    props?: { level?: number; url?: string; caption?: string };
    content?: BlockNoteInline[];
  }

  function inlineText(content: BlockNoteInline[] | undefined): string {
    if (!Array.isArray(content)) {
      return "";
    }
    return content.map((part) => part.text ?? "").join("");
  }

  export function blockNoteJsonToMarkdown(bodyJson: string): string {
    const trimmed = bodyJson.trim();
    if (trimmed === "" || trimmed === "[]") {
      return "";
    }

    let blocks: BlockNoteBlock[];
    try {
      const parsed = JSON.parse(trimmed);
      blocks = Array.isArray(parsed) ? (parsed as BlockNoteBlock[]) : [];
    } catch {
      return "";
    }

    const lines: string[] = [];
    for (const block of blocks) {
      const text = inlineText(block.content);
      switch (block.type) {
        case "heading": {
          const level = Math.min(Math.max(block.props?.level ?? 1, 1), 6);
          lines.push(`${"#".repeat(level)} ${text}`);
          break;
        }
        case "bulletListItem":
          lines.push(`- ${text}`);
          break;
        case "numberedListItem":
          lines.push(`1. ${text}`);
          break;
        case "image": {
          const url = block.props?.url ?? "";
          const caption = block.props?.caption ?? "";
          lines.push(`![${caption}](${url})`);
          break;
        }
        case "paragraph":
        default:
          lines.push(text);
          break;
      }
    }

    return lines.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  export function markdownToBlockNoteJson(markdown: string): string {
    const normalised = markdown.replace(/\r\n/g, "\n").trim();
    if (normalised === "") {
      return "[]";
    }

    const blocks: BlockNoteBlock[] = [];
    for (const rawLine of normalised.split("\n")) {
      const line = rawLine.trim();
      if (line === "") {
        continue;
      }

      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        blocks.push({
          type: "heading",
          props: { level: headingMatch[1].length },
          content: [{ type: "text", text: headingMatch[2].trim() }]
        });
        continue;
      }

      const bulletMatch = line.match(/^[-*+]\s+(.*)$/);
      if (bulletMatch) {
        blocks.push({
          type: "bulletListItem",
          content: [{ type: "text", text: bulletMatch[1].trim() }]
        });
        continue;
      }

      const numberedMatch = line.match(/^\d+\.\s+(.*)$/);
      if (numberedMatch) {
        blocks.push({
          type: "numberedListItem",
          content: [{ type: "text", text: numberedMatch[1].trim() }]
        });
        continue;
      }

      blocks.push({
        type: "paragraph",
        content: [{ type: "text", text: line }]
      });
    }

    return JSON.stringify(blocks);
  }
  ```

- [ ] 2.4 Run the test, expect PASS:
  ```bash
  pnpm vitest run packages/exporter/src/blockNoteMarkdown.test.ts
  ```
  Expected output: `5 passed`.

- [ ] 2.5 Re-run the existing exporter test to prove no regression in `renderMarkdownToHtml`:
  ```bash
  pnpm vitest run packages/exporter/src/manifest.test.ts
  ```
  Expected output: `2 passed`.

- [ ] 2.6 Commit:
  ```bash
  git add packages/exporter/src/renderMarkdown.ts packages/exporter/src/blockNoteMarkdown.test.ts
  git commit -m "feat(exporter): blockNoteJsonToMarkdown + markdownToBlockNoteJson per contracts section 7

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 3 — Shared graph TS types in `desktop-api` (idempotent with WS2)

The static-bundle transport (Task 4) and the bundle type (Task 1) both import the WS0 §5.1 TS types. They must exist as **exports** of `@research-canvas/desktop-api`. WS2 may already export them; this task adds them only if absent, then proves they are importable.

**Files:**
- Modify: `packages/desktop-api/src/index.ts` (append a graph-types export block after the existing `SavedSequence` interface ends at line 135, before the `interface WorkspaceTransport` declaration at line 137)
- Create: `packages/desktop-api/src/graphTypes.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (exact contracts §5.1 shapes): `EntityType`, `GraphNode`, `GraphRelationship`, `NodeLayout`, `EdgeLayout`, `JoinedCanvasNode`, `CanvasView`, `LitInstance`, `ArchetypalLighting`, `NewGraphNodeInput`, `GraphNodePatch`.

**Steps:**

- [ ] 3.1 Check whether WS2 already added these. WS2 places the §5.1 types in a dedicated `packages/desktop-api/src/graph.ts` module and re-exports them from `index.ts` (it does **not** declare `export interface GraphNode` directly in `index.ts`). So the reliable idempotency signal is the presence of that module **and** its re-export. Run:
  ```bash
  ls "/Users/admin/Documents/Antichrist Project/packages/desktop-api/src/graph.ts" 2>/dev/null && \
    grep -n 'from "./graph"' "/Users/admin/Documents/Antichrist Project/packages/desktop-api/src/index.ts"
  ```
  - If `graph.ts` exists **and** the grep prints a `from "./graph"` line, WS2 landed them. **Skip steps 3.3–3.4** (do **not** add the types — that would duplicate the declarations WS2 placed in `graph.ts` and cause a redeclaration error), go straight to 3.2 (write the assertion test, which imports from `./index` and therefore validates the WS2 re-export) then 3.5.
  - If `graph.ts` does not exist (or `index.ts` has no `from "./graph"` re-export), WS2 has not landed them — proceed through all steps.

- [ ] 3.2 Write the failing test. Create `packages/desktop-api/src/graphTypes.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";

  import type {
    ArchetypalLighting,
    CanvasView,
    EdgeLayout,
    EntityType,
    GraphNode,
    GraphNodePatch,
    GraphRelationship,
    JoinedCanvasNode,
    LitInstance,
    NewGraphNodeInput,
    NodeLayout
  } from "./index";

  describe("graph shared types", () => {
    it("constructs a GraphNode and a JoinedCanvasNode matching contracts section 5.1", () => {
      const entityType: EntityType = "Event";
      const node: GraphNode = {
        graphNodeId: "n1",
        entityType,
        title: "Banda genocide",
        body: "[]",
        summary: "1621",
        archetypalResonance: null,
        coordinate: null,
        sourceCoordinates: [],
        isTemporal: true,
        validFrom: "1621-01-01",
        validTo: "1621-12-31",
        temporalPrecision: "year",
        createdAt: "2026-06-28T12:00:00Z",
        updatedAt: "2026-06-28T12:00:00Z"
      };
      const layout: NodeLayout = {
        graphNodeId: "n1",
        canvasId: "c1",
        positionX: 0,
        positionY: 0,
        width: 200,
        height: 120,
        style: {}
      };
      const joined: JoinedCanvasNode = { node, layout };
      expect(joined.node.graphNodeId).toBe("n1");
      expect(joined.layout.canvasId).toBe("c1");
    });

    it("constructs relationship, edge layout, lighting, patch, and input shapes", () => {
      const rel: GraphRelationship = {
        id: "r1",
        relType: "INSTANTIATES",
        sourceGraphNodeId: "n1",
        targetGraphNodeId: "n2",
        properties: { dominance: "dominant" }
      };
      const edge: EdgeLayout = {
        id: "e1",
        canvasId: "c1",
        sourceGraphNodeId: "n1",
        targetGraphNodeId: "n2",
        relationKind: "INSTANTIATES",
        style: {}
      };
      const lit: LitInstance = {
        node: {
          graphNodeId: "n1",
          entityType: "Event",
          title: "x",
          body: "[]",
          summary: "",
          archetypalResonance: null,
          coordinate: null,
          sourceCoordinates: [],
          isTemporal: true,
          validFrom: null,
          validTo: null,
          temporalPrecision: null,
          createdAt: "t",
          updatedAt: "t"
        },
        relType: "INSTANTIATES",
        dominance: "dominant"
      };
      const lighting: ArchetypalLighting = { operator: lit.node, instances: [lit] };
      const view: CanvasView = {
        canvasId: "c1",
        nodes: [],
        edges: [edge],
        relationships: [rel],
        viewport: { x: 0, y: 0, zoom: 1 },
        appState: {}
      };
      const input: NewGraphNodeInput = {
        entityType: "Dynamic",
        title: "Monopoly",
        body: "[]",
        isTemporal: false
      };
      const patch: GraphNodePatch = { title: "renamed" };
      expect(rel.relType).toBe("INSTANTIATES");
      expect(lighting.instances).toHaveLength(1);
      expect(view.relationships[0].id).toBe("r1");
      expect(input.entityType).toBe("Dynamic");
      expect(patch.title).toBe("renamed");
    });
  });
  ```

- [ ] 3.3 Run the test, expect FAIL (only if WS2 had not added the types):
  ```bash
  pnpm vitest run packages/desktop-api/src/graphTypes.test.ts
  ```
  Expected output: failure with TypeScript errors `Module '"./index"' has no exported member 'GraphNode'` (and similar) reported by Vitest's transform.

- [ ] 3.4 Add the type block. Open `packages/desktop-api/src/index.ts` and insert immediately after the `SavedSequence` interface (after line 135, before `interface WorkspaceTransport {` at line 137):
  ```ts
  export type EntityType =
    | "Figure"
    | "People"
    | "Event"
    | "Institution"
    | "Source"
    | "Place"
    | "Work"
    | "Archetype"
    | "Dynamic"
    | "PsychoidOperator";

  export interface GraphNode {
    graphNodeId: string;
    entityType: EntityType;
    title: string;
    body: string;
    summary: string;
    archetypalResonance: string | null;
    coordinate: string | null;
    sourceCoordinates: string[];
    isTemporal: boolean;
    validFrom: string | null;
    validTo: string | null;
    temporalPrecision:
      | "year"
      | "month"
      | "day"
      | "decade"
      | "century"
      | "millennium"
      | null;
    createdAt: string;
    updatedAt: string;
  }

  export interface GraphRelationship {
    id: string;
    relType: string;
    sourceGraphNodeId: string;
    targetGraphNodeId: string;
    properties: Record<string, unknown>;
  }

  export interface NodeLayout {
    graphNodeId: string;
    canvasId: string;
    positionX: number;
    positionY: number;
    width: number;
    height: number;
    style: {
      dotColour?: string;
      bgColour?: string;
      textColour?: string;
      thumbnail?: string;
    };
  }

  export interface EdgeLayout {
    id: string;
    canvasId: string;
    sourceGraphNodeId: string;
    targetGraphNodeId: string;
    relationKind: string;
    sourceHandleId?: string;
    targetHandleId?: string;
    style: { stroke?: string; width?: number; dashed?: boolean };
  }

  export interface JoinedCanvasNode {
    node: GraphNode;
    layout: NodeLayout;
  }

  export interface CanvasView {
    canvasId: string;
    nodes: JoinedCanvasNode[];
    edges: EdgeLayout[];
    relationships: GraphRelationship[];
    viewport: { x: number; y: number; zoom: number };
    appState: Record<string, unknown>;
  }

  export interface LitInstance {
    node: GraphNode;
    relType: "INSTANTIATES" | "ECHOES";
    dominance: "dominant" | "secondary" | null;
  }

  export interface ArchetypalLighting {
    operator: GraphNode;
    instances: LitInstance[];
  }

  export interface NewGraphNodeInput {
    entityType: EntityType;
    title: string;
    body: string;
    coordinate?: string | null;
    sourceCoordinates?: string[];
    isTemporal: boolean;
    validFrom?: string | null;
    validTo?: string | null;
    temporalPrecision?: GraphNode["temporalPrecision"];
  }

  export type GraphNodePatch = Partial<
    Pick<
      GraphNode,
      | "title"
      | "body"
      | "summary"
      | "archetypalResonance"
      | "coordinate"
      | "sourceCoordinates"
      | "isTemporal"
      | "validFrom"
      | "validTo"
      | "temporalPrecision"
    >
  >;
  ```

- [ ] 3.5 Run the test, expect PASS:
  ```bash
  pnpm vitest run packages/desktop-api/src/graphTypes.test.ts
  ```
  Expected output: `2 passed`.

- [ ] 3.6 Commit:
  ```bash
  git add packages/desktop-api/src/index.ts packages/desktop-api/src/graphTypes.test.ts
  git commit -m "feat(desktop-api): export WS0 section 5.1 graph shared types

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 4 — `createStaticBundleTransport`: read-only `WorkspaceTransport` over a bundle

The structural enforcement of design §6 ("web build does not edit the theory"). This factory implements the read methods of `WorkspaceTransport` (contracts §5.2/§5.3) directly against an in-memory `GraphExportBundle`, and makes every mutation method throw `Error("read-only web build")`. The web build selects this behind the same `WorkspaceTransport` interface, so the canvas/timeline view code is reused unchanged.

**Files:**
- Modify: `packages/desktop-api/src/index.ts` (extend the `WorkspaceTransport` interface with the WS0 §5.2 graph methods; add the `createStaticBundleTransport` factory after `createBrowserBridgeTransport`, which ends at line 359)
- Create: `packages/desktop-api/src/staticBundleTransport.test.ts`

**Interfaces:**
- Consumes:
  - Task 1: `GraphExportBundle` from `@research-canvas/exporter`.
  - Task 3 / WS2: `GraphNode`, `CanvasView`, `ArchetypalLighting`, `LitInstance`, `JoinedCanvasNode`, `NodeLayout` (contracts §5.1).
  - WS0 §5.2 method signatures: `readGraphNode({ graphNodeId }): Promise<GraphNode>`, `searchGraph({ query, limit? }): Promise<GraphNode[]>`, `loadCanvasView({ canvasId, lens }): Promise<CanvasView>`, `archetypalLighting({ operatorGraphNodeId }): Promise<ArchetypalLighting>`, `resonancesForInstance({ graphNodeId }): Promise<LitInstance[]>`.
- Produces: `function createStaticBundleTransport(bundle: GraphExportBundle): WorkspaceTransport`.

**Steps:**

- [ ] 4.1 Make `desktop-api` depend on `exporter` so it can import `GraphExportBundle`. Run:
  ```bash
  grep -n "@research-canvas/exporter" "/Users/admin/Documents/Antichrist Project/packages/desktop-api/package.json"
  ```
  - If it prints a line, skip to 4.2.
  - If nothing prints: edit `packages/desktop-api/package.json` to add `"@research-canvas/exporter": "workspace:*"` to `dependencies` (keep alphabetical with existing entries), then run `pnpm install` (expect `Done`).

  > Note: Task 1 made `exporter` depend on `desktop-api` (type-only). To avoid a TS project-reference cycle, `staticBundleTransport.ts` imports `GraphExportBundle` **type-only** (`import type`) and the Vitest alias in `vitest.config.ts` already resolves both packages from source, so tests run regardless of `tsc -b` reference ordering. Do **not** add `exporter` to `packages/desktop-api/tsconfig.json` `references` (that would create the cycle); the type-only import is erased at emit.

- [ ] 4.2 Write the failing test. Create `packages/desktop-api/src/staticBundleTransport.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";

  import type { GraphExportBundle } from "@research-canvas/exporter";

  import { createStaticBundleTransport } from "./index";

  function fixtureBundle(): GraphExportBundle {
    const monopoly: GraphExportBundle["nodes"][number] = {
      graphNodeId: "node-monopoly",
      entityType: "Dynamic",
      title: "Monopoly mechanism",
      body: "[]",
      summary: "trans-temporal pattern",
      archetypalResonance: null,
      coordinate: null,
      sourceCoordinates: [],
      isTemporal: false,
      validFrom: null,
      validTo: null,
      temporalPrecision: null,
      createdAt: "2026-06-28T12:00:00Z",
      updatedAt: "2026-06-28T12:00:00Z"
    };
    const banda: GraphExportBundle["nodes"][number] = {
      graphNodeId: "node-banda",
      entityType: "Event",
      title: "Banda genocide",
      body: "[]",
      summary: "1621",
      archetypalResonance: null,
      coordinate: null,
      sourceCoordinates: [],
      isTemporal: true,
      validFrom: "1621-01-01",
      validTo: "1621-12-31",
      temporalPrecision: "year",
      createdAt: "2026-06-28T12:00:00Z",
      updatedAt: "2026-06-28T12:00:00Z"
    };
    return {
      generatedAt: "2026-06-28T12:00:00Z",
      project: {
        coverAssetPath: null,
        createdAt: "2026-06-28T12:00:00Z",
        displayName: "Antichrist",
        id: "11111111-1111-4111-8111-111111111111",
        parentProjectId: null,
        primaryCanvasId: "c1",
        publishSettings: {
          includeResources: true,
          mobileSequenceFirst: true,
          theme: "paper"
        },
        rootPath: "/tmp/antichrist",
        slug: "antichrist",
        summary: "Theory graph",
        updatedAt: "2026-06-28T12:00:00Z"
      },
      canvasId: "c1",
      nodes: [monopoly, banda],
      relationships: [
        {
          id: "rel-1",
          relType: "INSTANTIATES",
          sourceGraphNodeId: "node-banda",
          targetGraphNodeId: "node-monopoly",
          properties: { dominance: "dominant" }
        }
      ],
      nodeLayout: [
        {
          graphNodeId: "node-banda",
          canvasId: "c1",
          positionX: 100,
          positionY: 200,
          width: 240,
          height: 160,
          style: {}
        }
      ],
      edgeLayout: [],
      viewport: { x: 5, y: 6, zoom: 2 },
      appState: { activeLens: "canvas" },
      lightingIndex: {
        "node-monopoly": [
          { node: banda, relType: "INSTANTIATES", dominance: "dominant" }
        ]
      },
      assets: []
    };
  }

  describe("createStaticBundleTransport", () => {
    it("reads a single graph node by id", async () => {
      const transport = createStaticBundleTransport(fixtureBundle());
      const node = await transport.readGraphNode({ graphNodeId: "node-banda" });
      expect(node.title).toBe("Banda genocide");
    });

    it("loadCanvasView('canvas') returns all nodes, synthesising default layout for unplaced ones", async () => {
      const transport = createStaticBundleTransport(fixtureBundle());
      const view = await transport.loadCanvasView({ canvasId: "c1", lens: "canvas" });
      expect(view.nodes).toHaveLength(2);
      const monopoly = view.nodes.find((n) => n.node.graphNodeId === "node-monopoly");
      // monopoly had no layout row -> synthesised default
      expect(monopoly?.layout.width).toBeGreaterThan(0);
      const banda = view.nodes.find((n) => n.node.graphNodeId === "node-banda");
      expect(banda?.layout.positionX).toBe(100);
      expect(view.viewport).toEqual({ x: 5, y: 6, zoom: 2 });
      expect(view.relationships).toHaveLength(1);
    });

    it("loadCanvasView('timeline') returns only isTemporal nodes", async () => {
      const transport = createStaticBundleTransport(fixtureBundle());
      const view = await transport.loadCanvasView({ canvasId: "c1", lens: "timeline" });
      expect(view.nodes).toHaveLength(1);
      expect(view.nodes[0].node.graphNodeId).toBe("node-banda");
    });

    it("archetypalLighting reads the precomputed lighting index", async () => {
      const transport = createStaticBundleTransport(fixtureBundle());
      const lighting = await transport.archetypalLighting({
        operatorGraphNodeId: "node-monopoly"
      });
      expect(lighting.operator.graphNodeId).toBe("node-monopoly");
      expect(lighting.instances).toHaveLength(1);
      expect(lighting.instances[0].node.graphNodeId).toBe("node-banda");
      expect(lighting.instances[0].dominance).toBe("dominant");
    });

    it("resonancesForInstance returns operators that light a given instance", async () => {
      const transport = createStaticBundleTransport(fixtureBundle());
      const resonances = await transport.resonancesForInstance({
        graphNodeId: "node-banda"
      });
      expect(resonances).toHaveLength(1);
      expect(resonances[0].node.graphNodeId).toBe("node-monopoly");
      expect(resonances[0].relType).toBe("INSTANTIATES");
    });

    it("searchGraph matches title and summary case-insensitively", async () => {
      const transport = createStaticBundleTransport(fixtureBundle());
      const hits = await transport.searchGraph({ query: "banda" });
      expect(hits.map((h) => h.graphNodeId)).toContain("node-banda");
    });

    it("every mutation method throws 'read-only web build'", async () => {
      const transport = createStaticBundleTransport(fixtureBundle());
      await expect(
        transport.createGraphNode({ entityType: "Event", title: "x", body: "[]", isTemporal: true })
      ).rejects.toThrow("read-only web build");
      await expect(
        transport.updateGraphNode({ graphNodeId: "node-banda", patch: { title: "y" } })
      ).rejects.toThrow("read-only web build");
      await expect(transport.deleteGraphNode({ graphNodeId: "node-banda" })).rejects.toThrow(
        "read-only web build"
      );
      await expect(
        transport.connectGraphNodes({
          sourceGraphNodeId: "node-banda",
          targetGraphNodeId: "node-monopoly",
          relType: "INSTANTIATES"
        })
      ).rejects.toThrow("read-only web build");
      await expect(
        transport.disconnectGraphNodes({ relationshipId: "rel-1" })
      ).rejects.toThrow("read-only web build");
      await expect(
        transport.upsertNodeLayout({
          layout: {
            graphNodeId: "node-banda",
            canvasId: "c1",
            positionX: 0,
            positionY: 0,
            width: 1,
            height: 1,
            style: {}
          }
        })
      ).rejects.toThrow("read-only web build");
      expect(() =>
        transport.flushCanvasLayout({
          canvasId: "c1",
          layouts: [],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
          appState: {}
        })
      ).toThrow("read-only web build");
    });
  });
  ```

- [ ] 4.3 Run the test, expect FAIL:
  ```bash
  pnpm vitest run packages/desktop-api/src/staticBundleTransport.test.ts
  ```
  Expected output: failure with `createStaticBundleTransport is not a function` / `has no exported member 'createStaticBundleTransport'`.

- [ ] 4.4 Extend the `WorkspaceTransport` interface. Open `packages/desktop-api/src/index.ts` and add the following methods inside `interface WorkspaceTransport { ... }` (after the existing `deleteSavedSequence` method at line 164, before the closing `}` at line 165):
  ```ts
    // ---- Substance (Neo4j) ----
    readGraphNode(input: { graphNodeId: string }): Promise<GraphNode>;
    createGraphNode(input: NewGraphNodeInput): Promise<GraphNode>;
    updateGraphNode(input: { graphNodeId: string; patch: GraphNodePatch }): Promise<GraphNode>;
    deleteGraphNode(input: { graphNodeId: string }): Promise<void>;
    connectGraphNodes(input: {
      sourceGraphNodeId: string;
      targetGraphNodeId: string;
      relType: string;
      properties?: Record<string, unknown>;
    }): Promise<GraphRelationship>;
    disconnectGraphNodes(input: { relationshipId: string }): Promise<void>;
    searchGraph(input: { query: string; limit?: number }): Promise<GraphNode[]>;

    // ---- Layout (SQLite) ----
    upsertNodeLayout(input: { databasePath?: string; layout: NodeLayout }): Promise<void>;
    upsertNodeLayouts(input: { databasePath?: string; canvasId: string; layouts: NodeLayout[] }): Promise<number>;
    upsertEdgeLayout(input: { databasePath?: string; layout: EdgeLayout }): Promise<void>;
    upsertCanvasAppState(input: {
      databasePath?: string; canvasId: string;
      viewport: { x: number; y: number; zoom: number };
      appState: Record<string, unknown>;
    }): Promise<void>;
    flushCanvasLayout(input: {
      canvasId: string;
      layouts: NodeLayout[];
      edges: EdgeLayout[];
      viewport: { x: number; y: number; zoom: number };
      appState: Record<string, unknown>;
    }): boolean | Promise<boolean>;

    // ---- Joined reads (both targets) ----
    loadCanvasView(input: { databasePath?: string; canvasId: string; lens: "canvas" | "timeline" }): Promise<CanvasView>;

    // ---- Two-lens / archetypal lighting ----
    archetypalLighting(input: { operatorGraphNodeId: string }): Promise<ArchetypalLighting>;
    resonancesForInstance(input: { graphNodeId: string }): Promise<LitInstance[]>;
  ```

  > WS2 owns the Tauri-transport and browser-bridge-transport implementations of these methods. WS7 owns **only** the `createStaticBundleTransport` implementation below. **The five layout/read members above carry the optional `databasePath?: string` parameter (first field of each input object) to match WS2's `WorkspaceTransport` extension byte-for-byte** — `upsertNodeLayout`, `upsertNodeLayouts`, `upsertEdgeLayout`, `upsertCanvasAppState`, and `loadCanvasView`. The "keep one copy" instruction below only holds if the signatures are identical; if these did not include `databasePath?:`, TypeScript would see two incompatible `WorkspaceTransport` declarations. If WS2 has already extended the interface with these exact signatures, do not duplicate — the interface members are identical; keep one copy. (`flushCanvasLayout` is **not** part of WS2's block; it is the existing crash-safe flush member already present on the interface, and the static transport overrides it to throw. The static transport ignores `databasePath?:` since it reads from the in-memory bundle, but the parameter must be present for the interface to line up.)

- [ ] 4.5 Add the factory. At the **end** of `packages/desktop-api/src/index.ts` (after the `parentDirectory` helper at line 593), append:
  ```ts
  import type { GraphExportBundle } from "@research-canvas/exporter";

  const READ_ONLY_MESSAGE = "read-only web build";

  function defaultLayoutFor(graphNodeId: string, canvasId: string): NodeLayout {
    // Deterministic auto-placement for substance with no layout row, so an
    // agent-authored node still surfaces in the read-only viewer.
    let hash = 0;
    for (let i = 0; i < graphNodeId.length; i += 1) {
      hash = (hash * 31 + graphNodeId.charCodeAt(i)) >>> 0;
    }
    const column = hash % 6;
    const row = Math.floor(hash / 6) % 6;
    return {
      graphNodeId,
      canvasId,
      positionX: 80 + column * 320,
      positionY: 80 + row * 220,
      width: 240,
      height: 160,
      style: {}
    };
  }

  export function createStaticBundleTransport(bundle: GraphExportBundle): WorkspaceTransport {
    const nodeById = new Map<string, GraphNode>(
      bundle.nodes.map((node) => [node.graphNodeId, node])
    );
    const layoutById = new Map<string, NodeLayout>(
      bundle.nodeLayout.map((layout) => [layout.graphNodeId, layout])
    );

    const readOnlyReject = () => Promise.reject(new Error(READ_ONLY_MESSAGE));
    const readOnlyThrow = (): never => {
      throw new Error(READ_ONLY_MESSAGE);
    };

    return {
      // ---- existing project/file/annotation methods: not served by the static bundle ----
      attachProjectResourceRoot: readOnlyReject,
      bootstrapWorkspace: readOnlyReject,
      detachProjectResourceRoot: readOnlyReject,
      listProjectResourceRoots: readOnlyReject,
      loadProjectDocument: readOnlyReject,
      flushProjectDocument: readOnlyThrow,
      persistProjectDocument: readOnlyReject,
      searchProject: readOnlyReject,
      listDirectories: readOnlyReject,
      listSavedSequences: readOnlyReject,
      createSavedSequence: readOnlyReject,
      updateSavedSequence: readOnlyReject,
      deleteSavedSequence: readOnlyReject,

      // ---- substance reads ----
      async readGraphNode({ graphNodeId }) {
        const node = nodeById.get(graphNodeId);
        if (!node) {
          throw new Error(`graph node not found: ${graphNodeId}`);
        }
        return node;
      },
      async searchGraph({ query, limit }) {
        const needle = query.trim().toLowerCase();
        if (needle === "") {
          return [];
        }
        const hits = bundle.nodes.filter((node) =>
          `${node.title}\n${node.summary}\n${node.archetypalResonance ?? ""}`
            .toLowerCase()
            .includes(needle)
        );
        return typeof limit === "number" ? hits.slice(0, limit) : hits;
      },
      async loadCanvasView({ canvasId, lens }) {
        const visible =
          lens === "timeline"
            ? bundle.nodes.filter((node) => node.isTemporal)
            : bundle.nodes;
        const joined: JoinedCanvasNode[] = visible.map((node) => ({
          node,
          layout: layoutById.get(node.graphNodeId) ?? defaultLayoutFor(node.graphNodeId, canvasId)
        }));
        return {
          canvasId,
          nodes: joined,
          edges: bundle.edgeLayout,
          relationships: bundle.relationships,
          viewport: bundle.viewport,
          appState: bundle.appState
        };
      },
      async archetypalLighting({ operatorGraphNodeId }) {
        const operator = nodeById.get(operatorGraphNodeId);
        if (!operator) {
          throw new Error(`operator node not found: ${operatorGraphNodeId}`);
        }
        return {
          operator,
          instances: bundle.lightingIndex[operatorGraphNodeId] ?? []
        };
      },
      async resonancesForInstance({ graphNodeId }) {
        const result: LitInstance[] = [];
        for (const [operatorId, instances] of Object.entries(bundle.lightingIndex)) {
          const hit = instances.find((instance) => instance.node.graphNodeId === graphNodeId);
          if (!hit) {
            continue;
          }
          const operator = nodeById.get(operatorId);
          if (!operator) {
            continue;
          }
          result.push({ node: operator, relType: hit.relType, dominance: hit.dominance });
        }
        return result;
      },

      // ---- mutations: structurally forbidden on the web read-layer ----
      createGraphNode: readOnlyReject,
      updateGraphNode: readOnlyReject,
      deleteGraphNode: readOnlyReject,
      connectGraphNodes: readOnlyReject,
      disconnectGraphNodes: readOnlyReject,
      upsertNodeLayout: readOnlyReject,
      upsertNodeLayouts: readOnlyReject,
      upsertEdgeLayout: readOnlyReject,
      upsertCanvasAppState: readOnlyReject,
      flushCanvasLayout: readOnlyThrow
    };
  }
  ```

  > The `import type { GraphExportBundle }` line must be at the **top** of the file with the other imports if your linter enforces top-level imports; TypeScript permits the import statement anywhere at module scope, but to satisfy the repo's existing import-at-top convention, move that single `import type` line up next to the existing `import type { ... } from "@research-canvas/schema";` at line 1. Keep it `import type` to avoid the project-reference cycle.

- [ ] 4.6 Run the test, expect PASS:
  ```bash
  pnpm vitest run packages/desktop-api/src/staticBundleTransport.test.ts
  ```
  Expected output: `8 passed`.

- [ ] 4.7 Commit:
  ```bash
  git add packages/desktop-api/package.json packages/desktop-api/src/index.ts packages/desktop-api/src/staticBundleTransport.test.ts pnpm-lock.yaml
  git commit -m "feat(desktop-api): createStaticBundleTransport read-only WorkspaceTransport over GraphExportBundle

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 5 — Web read-only canvas-lens view component

A read-only canvas view that renders `JoinedCanvasNode[]` from `loadCanvasView({ lens: "canvas" })` as positioned cards. It is the web target's reuse of the canvas lens (no editing). It renders from data only, with no Tauri/DB calls — proving the §3.2 seam.

**Files:**
- Create: `apps/public-viewer/src/routes/CanvasLensView.tsx`
- Create: `apps/public-viewer/src/routes/CanvasLensView.test.tsx`

**Interfaces:**
- Consumes: Task 4 `createStaticBundleTransport`; WS0 §5.1 `CanvasView`, `JoinedCanvasNode`; Task 1 `GraphExportBundle`.
- Produces: `function CanvasLensView({ bundle }: { bundle: GraphExportBundle }): JSX.Element`.

**Steps:**

- [ ] 5.1 Make the public-viewer depend on `desktop-api` (for the transport). Run:
  ```bash
  grep -n "@research-canvas/desktop-api" "/Users/admin/Documents/Antichrist Project/apps/public-viewer/package.json"
  ```
  - If it prints a line, skip to 5.2.
  - If nothing prints: edit `apps/public-viewer/package.json` to add `"@research-canvas/desktop-api": "workspace:*"` to `dependencies` (keep alphabetical), then `pnpm install` (expect `Done`).

- [ ] 5.2 Write the failing test. Create `apps/public-viewer/src/routes/CanvasLensView.test.tsx`:
  ```tsx
  import { render, screen, waitFor } from "@testing-library/react";
  import { describe, expect, it } from "vitest";

  import type { GraphExportBundle } from "@research-canvas/exporter";

  import { CanvasLensView } from "./CanvasLensView";

  function bundle(): GraphExportBundle {
    return {
      generatedAt: "2026-06-28T12:00:00Z",
      project: {
        coverAssetPath: null,
        createdAt: "2026-06-28T12:00:00Z",
        displayName: "Antichrist",
        id: "11111111-1111-4111-8111-111111111111",
        parentProjectId: null,
        primaryCanvasId: "c1",
        publishSettings: { includeResources: true, mobileSequenceFirst: true, theme: "paper" },
        rootPath: "/tmp/antichrist",
        slug: "antichrist",
        summary: "Theory graph",
        updatedAt: "2026-06-28T12:00:00Z"
      },
      canvasId: "c1",
      nodes: [
        {
          graphNodeId: "node-monopoly",
          entityType: "Dynamic",
          title: "Monopoly mechanism",
          body: "[]",
          summary: "pattern",
          archetypalResonance: null,
          coordinate: null,
          sourceCoordinates: [],
          isTemporal: false,
          validFrom: null,
          validTo: null,
          temporalPrecision: null,
          createdAt: "t",
          updatedAt: "t"
        }
      ],
      relationships: [],
      nodeLayout: [
        {
          graphNodeId: "node-monopoly",
          canvasId: "c1",
          positionX: 40,
          positionY: 60,
          width: 240,
          height: 160,
          style: {}
        }
      ],
      edgeLayout: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      appState: {},
      lightingIndex: {},
      assets: []
    };
  }

  describe("CanvasLensView", () => {
    it("renders positioned read-only node cards from the bundle", async () => {
      render(<CanvasLensView bundle={bundle()} />);
      await waitFor(() => {
        expect(screen.getByText("Monopoly mechanism")).toBeInTheDocument();
      });
      const card = screen.getByTestId("canvas-node-node-monopoly");
      expect(card).toHaveStyle({ left: "40px", top: "60px" });
      expect(card.getAttribute("data-entity-type")).toBe("Dynamic");
    });
  });
  ```

- [ ] 5.3 Run the test, expect FAIL:
  ```bash
  pnpm vitest run apps/public-viewer/src/routes/CanvasLensView.test.tsx
  ```
  Expected output: failure with `Failed to resolve import "./CanvasLensView"`.

- [ ] 5.4 Implement the component. Create `apps/public-viewer/src/routes/CanvasLensView.tsx`:
  ```tsx
  import { useEffect, useMemo, useState } from "react";

  import type { GraphExportBundle } from "@research-canvas/exporter";
  import type { CanvasView } from "@research-canvas/desktop-api";
  import { createStaticBundleTransport } from "@research-canvas/desktop-api";

  interface CanvasLensViewProps {
    bundle: GraphExportBundle;
  }

  export function CanvasLensView({ bundle }: CanvasLensViewProps) {
    const transport = useMemo(() => createStaticBundleTransport(bundle), [bundle]);
    const [view, setView] = useState<CanvasView | null>(null);

    useEffect(() => {
      let cancelled = false;
      void transport
        .loadCanvasView({ canvasId: bundle.canvasId, lens: "canvas" })
        .then((next) => {
          if (!cancelled) {
            setView(next);
          }
        });
      return () => {
        cancelled = true;
      };
    }, [transport, bundle.canvasId]);

    if (!view) {
      return (
        <main className="viewer viewer--canvas">
          <p>Loading canvas…</p>
        </main>
      );
    }

    return (
      <main className="viewer viewer--canvas">
        <header className="viewer__hero">
          <p className="eyebrow">Canvas lens (read-only)</p>
          <h1>{bundle.project.displayName}</h1>
        </header>
        <div className="viewer__canvas-surface" data-testid="canvas-surface">
          {view.nodes.map(({ node, layout }) => (
            <article
              className="viewer__canvas-node"
              data-entity-type={node.entityType}
              data-testid={`canvas-node-${node.graphNodeId}`}
              key={node.graphNodeId}
              style={{
                position: "absolute",
                left: `${layout.positionX}px`,
                top: `${layout.positionY}px`,
                width: `${layout.width}px`,
                height: `${layout.height}px`
              }}
            >
              <h3>{node.title}</h3>
              <p>{node.summary || node.entityType}</p>
            </article>
          ))}
        </div>
      </main>
    );
  }
  ```

- [ ] 5.5 Run the test, expect PASS:
  ```bash
  pnpm vitest run apps/public-viewer/src/routes/CanvasLensView.test.tsx
  ```
  Expected output: `1 passed`.

- [ ] 5.6 Commit:
  ```bash
  git add apps/public-viewer/package.json apps/public-viewer/src/routes/CanvasLensView.tsx apps/public-viewer/src/routes/CanvasLensView.test.tsx pnpm-lock.yaml
  git commit -m "feat(public-viewer): read-only canvas lens rendering JoinedCanvasNode from static bundle

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 6 — Web read-only timeline-lens view with archetypal lighting

The timeline lens for the web build: it projects only `isTemporal` nodes (via `loadCanvasView({ lens: "timeline" })`), ordered by `validFrom`, and supports selecting a trans-temporal operator to **light** its instances (via `archetypalLighting`). This is the web reuse of WS5's timeline contract, rendered from the backend-less bundle.

**Files:**
- Create: `apps/public-viewer/src/routes/TimelineLensView.tsx`
- Create: `apps/public-viewer/src/routes/TimelineLensView.test.tsx`

**Interfaces:**
- Consumes: Task 4 `createStaticBundleTransport`; WS0 §5.1 `CanvasView`, `ArchetypalLighting`, `GraphNode`; Task 1 `GraphExportBundle`.
- Produces: `function TimelineLensView({ bundle }: { bundle: GraphExportBundle }): JSX.Element`.

**Steps:**

- [ ] 6.1 Write the failing test. Create `apps/public-viewer/src/routes/TimelineLensView.test.tsx`:
  ```tsx
  import { fireEvent, render, screen, waitFor } from "@testing-library/react";
  import { describe, expect, it } from "vitest";

  import type { GraphExportBundle } from "@research-canvas/exporter";

  import { TimelineLensView } from "./TimelineLensView";

  function bundle(): GraphExportBundle {
    const banda: GraphExportBundle["nodes"][number] = {
      graphNodeId: "node-banda",
      entityType: "Event",
      title: "Banda genocide",
      body: "[]",
      summary: "1621",
      archetypalResonance: null,
      coordinate: null,
      sourceCoordinates: [],
      isTemporal: true,
      validFrom: "1621-01-01",
      validTo: "1621-12-31",
      temporalPrecision: "year",
      createdAt: "t",
      updatedAt: "t"
    };
    const monopoly: GraphExportBundle["nodes"][number] = {
      graphNodeId: "node-monopoly",
      entityType: "Dynamic",
      title: "Monopoly mechanism",
      body: "[]",
      summary: "pattern",
      archetypalResonance: null,
      coordinate: null,
      sourceCoordinates: [],
      isTemporal: false,
      validFrom: null,
      validTo: null,
      temporalPrecision: null,
      createdAt: "t",
      updatedAt: "t"
    };
    return {
      generatedAt: "2026-06-28T12:00:00Z",
      project: {
        coverAssetPath: null,
        createdAt: "t",
        displayName: "Antichrist",
        id: "11111111-1111-4111-8111-111111111111",
        parentProjectId: null,
        primaryCanvasId: "c1",
        publishSettings: { includeResources: true, mobileSequenceFirst: true, theme: "paper" },
        rootPath: "/tmp/antichrist",
        slug: "antichrist",
        summary: "Theory graph",
        updatedAt: "t"
      },
      canvasId: "c1",
      nodes: [monopoly, banda],
      relationships: [],
      nodeLayout: [],
      edgeLayout: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      appState: {},
      lightingIndex: {
        "node-monopoly": [{ node: banda, relType: "INSTANTIATES", dominance: "dominant" }]
      },
      assets: []
    };
  }

  describe("TimelineLensView", () => {
    it("projects only temporal nodes, ordered, and shows their date", async () => {
      render(<TimelineLensView bundle={bundle()} />);
      await waitFor(() => {
        expect(screen.getByText("Banda genocide")).toBeInTheDocument();
      });
      // trans-temporal node is NOT projected onto the axis
      expect(screen.queryByTestId("timeline-event-node-monopoly")).toBeNull();
      expect(screen.getByTestId("timeline-event-node-banda")).toHaveTextContent("1621");
    });

    it("lighting an operator marks its instances as lit", async () => {
      render(<TimelineLensView bundle={bundle()} />);
      await waitFor(() => screen.getByText("Banda genocide"));

      const event = screen.getByTestId("timeline-event-node-banda");
      expect(event.getAttribute("data-lit")).toBe("false");

      fireEvent.click(screen.getByTestId("operator-node-monopoly"));

      await waitFor(() => {
        expect(
          screen.getByTestId("timeline-event-node-banda").getAttribute("data-lit")
        ).toBe("true");
      });
    });

    it("lights exactly the instances the bundle's lightingIndex names, with no backend", async () => {
      // The web read-layer must light from the precomputed bundle.lightingIndex
      // (populated by build_graph_bundle, WS7 Task 8) — not from any live query.
      // This proves the in-memory bundle fixture drives the lighting end-to-end.
      const fixture = bundle();
      const expectedLit = fixture.lightingIndex["node-monopoly"].map(
        (instance) => instance.node.graphNodeId
      );
      expect(expectedLit).toEqual(["node-banda"]);

      render(<TimelineLensView bundle={fixture} />);
      await waitFor(() => screen.getByText("Banda genocide"));

      fireEvent.click(screen.getByTestId("operator-node-monopoly"));
      await waitFor(() => {
        for (const id of expectedLit) {
          expect(
            screen.getByTestId(`timeline-event-${id}`).getAttribute("data-lit")
          ).toBe("true");
        }
      });

      // An operator absent from lightingIndex lights nothing (empty-index branch).
      const empty: GraphExportBundle = {
        ...fixture,
        lightingIndex: {}
      };
      render(<TimelineLensView bundle={empty} />);
      const allEvents = await screen.findAllByTestId("timeline-event-node-banda");
      // the freshly-rendered (empty-index) instance starts unlit and stays unlit
      expect(allEvents[allEvents.length - 1].getAttribute("data-lit")).toBe("false");
    });
  });
  ```

- [ ] 6.2 Run the test, expect FAIL:
  ```bash
  pnpm vitest run apps/public-viewer/src/routes/TimelineLensView.test.tsx
  ```
  Expected output: failure with `Failed to resolve import "./TimelineLensView"`.

- [ ] 6.3 Implement the component. Create `apps/public-viewer/src/routes/TimelineLensView.tsx`:
  ```tsx
  import { useEffect, useMemo, useState } from "react";

  import type { GraphExportBundle } from "@research-canvas/exporter";
  import type { CanvasView, GraphNode } from "@research-canvas/desktop-api";
  import { createStaticBundleTransport } from "@research-canvas/desktop-api";

  interface TimelineLensViewProps {
    bundle: GraphExportBundle;
  }

  function yearOf(node: GraphNode): string {
    if (!node.validFrom) {
      return "";
    }
    return node.validFrom.slice(0, 4);
  }

  export function TimelineLensView({ bundle }: TimelineLensViewProps) {
    const transport = useMemo(() => createStaticBundleTransport(bundle), [bundle]);
    const [view, setView] = useState<CanvasView | null>(null);
    const [litIds, setLitIds] = useState<Set<string>>(() => new Set());

    useEffect(() => {
      let cancelled = false;
      void transport
        .loadCanvasView({ canvasId: bundle.canvasId, lens: "timeline" })
        .then((next) => {
          if (!cancelled) {
            setView(next);
          }
        });
      return () => {
        cancelled = true;
      };
    }, [transport, bundle.canvasId]);

    const operators = useMemo(
      () => bundle.nodes.filter((node) => !node.isTemporal),
      [bundle.nodes]
    );

    const lightOperator = async (operatorGraphNodeId: string) => {
      const lighting = await transport.archetypalLighting({ operatorGraphNodeId });
      setLitIds(new Set(lighting.instances.map((instance) => instance.node.graphNodeId)));
    };

    if (!view) {
      return (
        <main className="viewer viewer--timeline">
          <p>Loading timeline…</p>
        </main>
      );
    }

    const events = view.nodes
      .map((joined) => joined.node)
      .slice()
      .sort((left, right) => (left.validFrom ?? "").localeCompare(right.validFrom ?? ""));

    return (
      <main className="viewer viewer--timeline">
        <header className="viewer__hero">
          <p className="eyebrow">Timeline lens (read-only)</p>
          <h1>{bundle.project.displayName}</h1>
        </header>

        <section className="viewer__section" aria-label="Lighting sources">
          <header className="viewer__section-header">
            <p className="eyebrow">Lighting sources</p>
            <h2>Trans-temporal operators</h2>
          </header>
          <div className="viewer__operator-row">
            {operators.map((operator) => (
              <button
                className="viewer__operator"
                data-testid={`operator-${operator.graphNodeId}`}
                key={operator.graphNodeId}
                onClick={() => {
                  void lightOperator(operator.graphNodeId);
                }}
                type="button"
              >
                {operator.title}
              </button>
            ))}
          </div>
        </section>

        <section className="viewer__section">
          <header className="viewer__section-header">
            <p className="eyebrow">Axis</p>
            <h2>Temporally-located nodes</h2>
          </header>
          <ol className="viewer__timeline-axis">
            {events.map((node) => (
              <li
                className="viewer__timeline-event"
                data-lit={litIds.has(node.graphNodeId) ? "true" : "false"}
                data-testid={`timeline-event-${node.graphNodeId}`}
                key={node.graphNodeId}
              >
                <span className="viewer__timeline-date">{yearOf(node)}</span>
                <span className="viewer__timeline-title">{node.title}</span>
              </li>
            ))}
          </ol>
        </section>
      </main>
    );
  }
  ```

- [ ] 6.4 Run the test, expect PASS:
  ```bash
  pnpm vitest run apps/public-viewer/src/routes/TimelineLensView.test.tsx
  ```
  Expected output: `3 passed`.

- [ ] 6.5 Commit:
  ```bash
  git add apps/public-viewer/src/routes/TimelineLensView.tsx apps/public-viewer/src/routes/TimelineLensView.test.tsx
  git commit -m "feat(public-viewer): read-only timeline lens with archetypal lighting from static bundle

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 7 — Route the web `App` to the graph bundle + lens switching

Wire the two new lens views into the public-viewer entry. The app loads a `GraphExportBundle` (from an injected prop, the bootstrapped `window.__RESEARCH_CANVAS_BUNDLE__`, or a `graph-bundle.json` fetch) and routes between canvas and timeline lenses. The existing `ExportBundle`-based `MapView`/`NodePage` paths remain for the legacy export, so this adds a graph route without removing the old one.

**Files:**
- Create: `apps/public-viewer/src/GraphApp.tsx`
- Create: `apps/public-viewer/src/GraphApp.test.tsx`
- Modify: `apps/public-viewer/src/OfflineBootstrap.tsx` (add a graph-bundle reader alongside the existing `readBootstrappedBundle`; lines 9–15 hold the existing reader)

**Interfaces:**
- Consumes: Task 1 `GraphExportBundle`, `parseGraphExportBundle`; Task 5 `CanvasLensView`; Task 6 `TimelineLensView`.
- Produces:
  - `function GraphApp({ bundle }: { bundle?: GraphExportBundle | null }): JSX.Element`
  - `function readBootstrappedGraphBundle(): GraphExportBundle | null` (in `OfflineBootstrap.tsx`)

**Steps:**

- [ ] 7.1 Add the graph-bundle reader. Open `apps/public-viewer/src/OfflineBootstrap.tsx` and replace its full contents with:
  ```tsx
  import type { ExportBundle } from "@research-canvas/schema";

  import type { GraphExportBundle } from "@research-canvas/exporter";
  import { parseGraphExportBundle } from "@research-canvas/exporter";

  declare global {
    interface Window {
      __RESEARCH_CANVAS_BUNDLE__?: ExportBundle;
      __RESEARCH_CANVAS_GRAPH_BUNDLE__?: GraphExportBundle;
    }
  }

  export function readBootstrappedBundle() {
    if (typeof window === "undefined") {
      return null;
    }

    return window.__RESEARCH_CANVAS_BUNDLE__ ?? null;
  }

  export function readBootstrappedGraphBundle(): GraphExportBundle | null {
    if (typeof window === "undefined") {
      return null;
    }

    const raw = window.__RESEARCH_CANVAS_GRAPH_BUNDLE__;
    if (!raw) {
      return null;
    }

    return parseGraphExportBundle(raw);
  }

  export function OfflineBootstrap({ bundle }: { bundle: ExportBundle }) {
    return (
      <script
        id="research-canvas-bundle"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(bundle) }}
      />
    );
  }
  ```

- [ ] 7.2 Write the failing test. Create `apps/public-viewer/src/GraphApp.test.tsx`:
  ```tsx
  import { fireEvent, render, screen, waitFor } from "@testing-library/react";
  import { describe, expect, it } from "vitest";

  import type { GraphExportBundle } from "@research-canvas/exporter";

  import { GraphApp } from "./GraphApp";

  function bundle(): GraphExportBundle {
    const banda: GraphExportBundle["nodes"][number] = {
      graphNodeId: "node-banda",
      entityType: "Event",
      title: "Banda genocide",
      body: "[]",
      summary: "1621",
      archetypalResonance: null,
      coordinate: null,
      sourceCoordinates: [],
      isTemporal: true,
      validFrom: "1621-01-01",
      validTo: "1621-12-31",
      temporalPrecision: "year",
      createdAt: "t",
      updatedAt: "t"
    };
    return {
      generatedAt: "2026-06-28T12:00:00Z",
      project: {
        coverAssetPath: null,
        createdAt: "t",
        displayName: "Antichrist",
        id: "11111111-1111-4111-8111-111111111111",
        parentProjectId: null,
        primaryCanvasId: "c1",
        publishSettings: { includeResources: true, mobileSequenceFirst: true, theme: "paper" },
        rootPath: "/tmp/antichrist",
        slug: "antichrist",
        summary: "Theory graph",
        updatedAt: "t"
      },
      canvasId: "c1",
      nodes: [banda],
      relationships: [],
      nodeLayout: [],
      edgeLayout: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      appState: {},
      lightingIndex: {},
      assets: []
    };
  }

  describe("GraphApp", () => {
    it("defaults to the canvas lens and switches to the timeline lens", async () => {
      render(<GraphApp bundle={bundle()} />);

      await waitFor(() => {
        expect(screen.getByText("Canvas lens (read-only)")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole("button", { name: /timeline/i }));

      await waitFor(() => {
        expect(screen.getByText("Timeline lens (read-only)")).toBeInTheDocument();
      });
    });

    it("shows a loading state when no bundle is available", () => {
      render(<GraphApp bundle={null} />);
      expect(screen.getByText(/loading export/i)).toBeInTheDocument();
    });
  });
  ```

- [ ] 7.3 Run the test, expect FAIL:
  ```bash
  pnpm vitest run apps/public-viewer/src/GraphApp.test.tsx
  ```
  Expected output: failure with `Failed to resolve import "./GraphApp"`.

- [ ] 7.4 Implement the entry. Create `apps/public-viewer/src/GraphApp.tsx`:
  ```tsx
  import { useEffect, useState } from "react";

  import type { GraphExportBundle } from "@research-canvas/exporter";
  import { parseGraphExportBundle } from "@research-canvas/exporter";

  import { CanvasLensView } from "./routes/CanvasLensView";
  import { TimelineLensView } from "./routes/TimelineLensView";
  import { readBootstrappedGraphBundle } from "./OfflineBootstrap";

  type Lens = "canvas" | "timeline";

  interface GraphAppProps {
    bundle?: GraphExportBundle | null;
  }

  export function GraphApp({ bundle: bundleProp = null }: GraphAppProps) {
    const bundle = useGraphBundle(bundleProp);
    const [lens, setLens] = useState<Lens>("canvas");

    if (!bundle) {
      return (
        <main className="viewer viewer--loading">
          <p>Loading export…</p>
        </main>
      );
    }

    return (
      <div className="viewer-shell">
        <nav className="viewer-shell__lens-switch" aria-label="Lens">
          <button
            aria-pressed={lens === "canvas"}
            onClick={() => setLens("canvas")}
            type="button"
          >
            Canvas
          </button>
          <button
            aria-pressed={lens === "timeline"}
            onClick={() => setLens("timeline")}
            type="button"
          >
            Timeline
          </button>
        </nav>
        {lens === "canvas" ? (
          <CanvasLensView bundle={bundle} />
        ) : (
          <TimelineLensView bundle={bundle} />
        )}
      </div>
    );
  }

  function useGraphBundle(bundle: GraphExportBundle | null) {
    const [resolved, setResolved] = useState<GraphExportBundle | null>(
      () => bundle ?? readBootstrappedGraphBundle()
    );

    useEffect(() => {
      if (bundle) {
        setResolved(bundle);
        return;
      }

      const bootstrapped = readBootstrappedGraphBundle();
      if (bootstrapped) {
        setResolved(bootstrapped);
        return;
      }

      let cancelled = false;
      void fetch("graph-bundle.json")
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`graph-bundle.json request failed with status ${response.status}`);
          }
          return parseGraphExportBundle(await response.json());
        })
        .then((next) => {
          if (!cancelled) {
            setResolved(next);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setResolved(null);
          }
        });

      return () => {
        cancelled = true;
      };
    }, [bundle]);

    return resolved;
  }
  ```

- [ ] 7.5 Run the test, expect PASS:
  ```bash
  pnpm vitest run apps/public-viewer/src/GraphApp.test.tsx
  ```
  Expected output: `2 passed`.

- [ ] 7.6 Run the full public-viewer + desktop-api + exporter suites to prove no regression:
  ```bash
  pnpm vitest run apps/public-viewer packages/desktop-api packages/exporter
  ```
  Expected output: all test files pass (the existing `App.test.tsx`, `manifest.test.ts`, plus the new files), `0 failed`.

- [ ] 7.7 Commit:
  ```bash
  git add apps/public-viewer/src/GraphApp.tsx apps/public-viewer/src/GraphApp.test.tsx apps/public-viewer/src/OfflineBootstrap.tsx
  git commit -m "feat(public-viewer): GraphApp routing canvas/timeline lenses from graph bundle

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 8 — Rust serializer: join Neo4j substance ⨝ SQLite layout → bundle JSON

The desktop side that produces the `GraphExportBundle` JSON for the web build. It reads substance from `GraphRepository`, layout from `LayoutRepository`, and **builds the `lightingIndex` by enumerating the lighting-source nodes (entity type `Archetype` or `Dynamic` or `PsychoidOperator`, per contracts §2.1 / §8.2) and calling `GraphRepository::archetypal_lighting(operator_graph_node_id)` once per operator**, collecting each result's `Vec<LitInstance>` into the `Record<string, LitInstance[]>` keyed by `operatorGraphNodeId`. This is the load-bearing population step: without it the web timeline's archetypal lighting renders empty (the `createStaticBundleTransport.archetypalLighting` reads straight from this precomputed index — Task 4). It then serializes the same JSON shape Task 1 parses. **Depends on WS2** (`GraphRepository`, `LayoutRepository`). If WS2 has not landed, stop and complete WS2 first.

> **Why entity-type, not `is_temporal`:** the lighting sources are exactly the trans-temporal operator types `Archetype`, `Dynamic`, `PsychoidOperator` (§2.1). Filtering on `!is_temporal` alone would also sweep in `Work` and atemporal `Place` nodes (which have no `INSTANTIATES`/`ECHOES` in-edges, so they would just produce empty lighting and waste a Cypher round-trip), and — more importantly — would still **miss** any operator whose `is_temporal` flag was authored `true`. Enumerating by entity type is the correct contract.
>
> **PsychoidOperator caveat (WS2 dependency):** seeded `PsychoidOperator` nodes carry the `:Operator` label and are **not** `:TheoryNode` (§2.1). WS2's `GraphRepository::list_nodes_for_lens("canvas")` matches `(:TheoryNode)` only (WS2 Task 9), so it returns `Archetype`/`Dynamic` operators but **not** `PsychoidOperator` ones; and WS2's `archetypal_lighting` resolves its operator via `get_node`, which also matches `:TheoryNode` only (WS2 Task 7), so passing a `PsychoidOperator` id would error `operator not found`. Therefore Task 8 as written lights `Archetype`/`Dynamic` operators (the v1-critical lighting sources). To also light seeded `PsychoidOperator` nodes, **add a bulk method to WS2** — e.g. `GraphRepository::list_lighting_sources() -> Result<Vec<GraphNode>, String>` (matching `(op) WHERE op:Archetype OR op:Dynamic OR op:PsychoidOperator`) plus relaxing `archetypal_lighting`'s operator lookup to match `:Operator` as well — and iterate its result here. Record that as a WS2 follow-up; do not duplicate the Cypher in WS7.

**Files:**
- Create: `apps/desktop/src-tauri/src/export/graph_bundle.rs`
- Modify: `apps/desktop/src-tauri/src/export/mod.rs` (add `pub mod graph_bundle;` — if `export/mod.rs` does not exist yet, create it with that single line and ensure `lib.rs` declares `pub mod export;`)
- Create: `apps/desktop/src-tauri/tests/graph_bundle_export.rs`

**Interfaces:**
- Consumes (WS2 §4.2/§4.3, contracts §5.1 Rust types):
  - `GraphRepository::new(graph: crate::db::neo4j::SharedGraph, database: String) -> Self`
  - `GraphRepository::list_nodes_for_lens(&self, lens: &str) -> Result<Vec<GraphNode>, String>` (use `"canvas"` to get all nodes)
  - `GraphRepository::list_relationships(&self) -> Result<Vec<GraphRelationship>, String>`
  - `GraphRepository::archetypal_lighting(&self, operator_graph_node_id: &str) -> Result<ArchetypalLightingResult, String>` (where `ArchetypalLightingResult { operator: GraphNode, instances: Vec<LitInstance> }`, `LitInstance { node: GraphNode, rel_type: String, dominance: Option<String> }`) — **called once per lighting-source operator** to populate `lightingIndex`. Operators are enumerated from `list_nodes_for_lens("canvas")` by `entity_type ∈ {"Archetype","Dynamic","PsychoidOperator"}` (§2.1), keying the index by `graph_node_id`. (Optional WS2 bulk add: `list_lighting_sources()` to also reach seeded `:Operator` PsychoidOperators — see task header.)
  - `LayoutRepository::new(connection: &rusqlite::Connection) -> Self`
  - `LayoutRepository::list_node_layout(&self, canvas_id: &str) -> rusqlite::Result<Vec<NodeLayoutRecord>>`
  - `LayoutRepository::list_edge_layout(&self, canvas_id: &str) -> rusqlite::Result<Vec<EdgeLayoutRecord>>`
  - `LayoutRepository::get_app_state(&self, canvas_id: &str) -> rusqlite::Result<Option<CanvasAppStateRecord>>`
  - Rust types `GraphNode`, `GraphRelationship`, `NodeLayoutRecord`, `EdgeLayoutRecord`, `CanvasAppStateRecord`, `ArchetypalLightingResult`, `LitInstance` from `crate::db::repositories::{graph, layout}`.
- Produces:
  - `pub struct GraphExportBundle { ... }` (serde, `#[serde(rename_all = "camelCase")]`) matching Task 1's TS shape
  - `pub async fn build_graph_bundle(graph_repo: &GraphRepository, conn: &rusqlite::Connection, canvas_id: &str, project_json: serde_json::Value) -> Result<GraphExportBundle, String>`
  - `pub fn serialize_graph_bundle(bundle: &GraphExportBundle) -> Result<String, String>`

**Steps:**

- [ ] 8.1 Confirm WS2 has landed the repositories. Run:
  ```bash
  ls "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/src/db/repositories/graph.rs" "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/src/db/repositories/layout.rs"
  ```
  Expected output: both paths listed. If either is missing, **stop** — complete WS2 first; this task cannot proceed.

- [ ] 8.2 Write the failing integration test. Create `apps/desktop/src-tauri/tests/graph_bundle_export.rs`:
  ```rust
  // Integration test: build_graph_bundle joins layout + a fixed substance set
  // into the camelCase JSON the TS GraphExportBundle parser accepts.
  // Substance is exercised via a serde round-trip of the Rust GraphExportBundle,
  // so this test runs without a live Neo4j (the live join is covered by WS2's repo tests).

  use research_canvas_desktop_lib::export::graph_bundle::{
      serialize_graph_bundle, GraphExportBundle,
  };

  #[test]
  fn serialized_bundle_uses_camel_case_keys() {
      let json_value = serde_json::json!({
          "generatedAt": "2026-06-28T12:00:00Z",
          "project": {
              "id": "11111111-1111-4111-8111-111111111111",
              "displayName": "Antichrist"
          },
          "canvasId": "c1",
          "nodes": [{
              "graphNodeId": "node-banda",
              "entityType": "Event",
              "title": "Banda genocide",
              "body": "[]",
              "summary": "1621",
              "archetypalResonance": null,
              "coordinate": null,
              "sourceCoordinates": [],
              "isTemporal": true,
              "validFrom": "1621-01-01",
              "validTo": "1621-12-31",
              "temporalPrecision": "year",
              "createdAt": "t",
              "updatedAt": "t"
          }],
          "relationships": [],
          "nodeLayout": [{
              "graphNodeId": "node-banda",
              "canvasId": "c1",
              "positionX": 1.0,
              "positionY": 2.0,
              "width": 3.0,
              "height": 4.0,
              "style": {}
          }],
          "edgeLayout": [],
          "viewport": { "x": 0.0, "y": 0.0, "zoom": 1.0 },
          "appState": {},
          "lightingIndex": {},
          "assets": []
      });

      let bundle: GraphExportBundle =
          serde_json::from_value(json_value).expect("bundle should deserialize");
      let serialized = serialize_graph_bundle(&bundle).expect("serialize");

      assert!(serialized.contains("\"graphNodeId\""));
      assert!(serialized.contains("\"isTemporal\""));
      assert!(serialized.contains("\"nodeLayout\""));
      assert!(serialized.contains("\"lightingIndex\""));
      // snake_case must NOT appear
      assert!(!serialized.contains("graph_node_id"));
      assert!(!serialized.contains("is_temporal"));
  }
  ```

  > `research_canvas_desktop_lib` is the crate's library name — verified against `apps/desktop/src-tauri/Cargo.toml` `[lib] name = "research_canvas_desktop_lib"`. If a future rename changes it, re-confirm there and substitute it in the `use` path. The test references `export::graph_bundle::*`, so `mod.rs` must re-export the submodule (step 8.4).

- [ ] 8.3 Run the test, expect FAIL:
  ```bash
  cargo test --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml" graph_bundle_export -- --test-threads=1
  ```
  Expected output: compile error `unresolved import research_canvas_desktop_lib::export::graph_bundle` (module does not exist yet).

- [ ] 8.4 Ensure the module is wired. Run:
  ```bash
  ls "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/src/export/mod.rs"
  ```
  - If it exists: add the line `pub mod graph_bundle;` to it (top of file).
  - If it does not exist: create `apps/desktop/src-tauri/src/export/mod.rs` containing exactly:
    ```rust
    pub mod graph_bundle;
    ```
    Then confirm `lib.rs` declares the module by running:
    ```bash
    grep -n "pub mod export" "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/src/lib.rs"
    ```
    If nothing prints, add `pub mod export;` to `lib.rs` next to the other `pub mod` declarations.

- [ ] 8.5 Implement the serializer. Create `apps/desktop/src-tauri/src/export/graph_bundle.rs`:
  ```rust
  use serde::{Deserialize, Serialize};
  use serde_json::Value;

  use crate::db::repositories::graph::{GraphNode, GraphRelationship, GraphRepository};
  use crate::db::repositories::layout::{
      CanvasAppStateRecord, EdgeLayoutRecord, LayoutRepository, NodeLayoutRecord,
  };

  #[derive(Debug, Clone, Serialize, Deserialize)]
  #[serde(rename_all = "camelCase")]
  pub struct BundleNodeLayout {
      pub graph_node_id: String,
      pub canvas_id: String,
      pub position_x: f64,
      pub position_y: f64,
      pub width: f64,
      pub height: f64,
      pub style: Value,
  }

  #[derive(Debug, Clone, Serialize, Deserialize)]
  #[serde(rename_all = "camelCase")]
  pub struct BundleEdgeLayout {
      pub id: String,
      pub canvas_id: String,
      pub source_graph_node_id: String,
      pub target_graph_node_id: String,
      pub relation_kind: String,
      #[serde(skip_serializing_if = "Option::is_none")]
      pub source_handle_id: Option<String>,
      #[serde(skip_serializing_if = "Option::is_none")]
      pub target_handle_id: Option<String>,
      pub style: Value,
  }

  #[derive(Debug, Clone, Serialize, Deserialize)]
  #[serde(rename_all = "camelCase")]
  pub struct BundleLitInstance {
      pub node: GraphNode,
      pub rel_type: String,
      pub dominance: Option<String>,
  }

  #[derive(Debug, Clone, Serialize, Deserialize)]
  #[serde(rename_all = "camelCase")]
  pub struct BundleViewport {
      pub x: f64,
      pub y: f64,
      pub zoom: f64,
  }

  #[derive(Debug, Clone, Serialize, Deserialize)]
  #[serde(rename_all = "camelCase")]
  pub struct GraphExportBundle {
      pub generated_at: String,
      pub project: Value,
      pub canvas_id: String,
      pub nodes: Vec<GraphNode>,
      pub relationships: Vec<GraphRelationship>,
      pub node_layout: Vec<BundleNodeLayout>,
      pub edge_layout: Vec<BundleEdgeLayout>,
      pub viewport: BundleViewport,
      pub app_state: Value,
      pub lighting_index: std::collections::BTreeMap<String, Vec<BundleLitInstance>>,
      pub assets: Vec<Value>,
  }

  fn parse_style(style_json: &str) -> Value {
      serde_json::from_str(style_json).unwrap_or_else(|_| serde_json::json!({}))
  }

  fn node_layout_from_record(record: NodeLayoutRecord) -> BundleNodeLayout {
      BundleNodeLayout {
          style: parse_style(&record.style_json),
          graph_node_id: record.graph_node_id,
          canvas_id: record.canvas_id,
          position_x: record.position_x,
          position_y: record.position_y,
          width: record.width,
          height: record.height,
      }
  }

  fn edge_layout_from_record(record: EdgeLayoutRecord) -> BundleEdgeLayout {
      BundleEdgeLayout {
          style: parse_style(&record.style_json),
          id: record.id,
          canvas_id: record.canvas_id,
          source_graph_node_id: record.source_graph_node_id,
          target_graph_node_id: record.target_graph_node_id,
          relation_kind: record.relation_kind,
          source_handle_id: record.source_handle_id,
          target_handle_id: record.target_handle_id,
      }
  }

  fn viewport_from_app_state(state: &Option<CanvasAppStateRecord>) -> (BundleViewport, Value) {
      let default_viewport = BundleViewport { x: 0.0, y: 0.0, zoom: 1.0 };
      let default_app_state = serde_json::json!({});
      let Some(record) = state else {
          return (default_viewport, default_app_state);
      };
      let viewport = serde_json::from_str::<BundleViewport>(&record.viewport_json)
          .unwrap_or(default_viewport);
      let app_state =
          serde_json::from_str::<Value>(&record.app_state_json).unwrap_or(default_app_state);
      (viewport, app_state)
  }

  /// Join Neo4j substance with SQLite layout into the backend-less bundle.
  pub async fn build_graph_bundle(
      graph_repo: &GraphRepository,
      conn: &rusqlite::Connection,
      canvas_id: &str,
      project_json: Value,
  ) -> Result<GraphExportBundle, String> {
      let nodes = graph_repo.list_nodes_for_lens("canvas").await?;
      let relationships = graph_repo.list_relationships().await?;

      let layout_repo = LayoutRepository::new(conn);
      let node_layout = layout_repo
          .list_node_layout(canvas_id)
          .map_err(|error| error.to_string())?
          .into_iter()
          .map(node_layout_from_record)
          .collect::<Vec<_>>();
      let edge_layout = layout_repo
          .list_edge_layout(canvas_id)
          .map_err(|error| error.to_string())?
          .into_iter()
          .map(edge_layout_from_record)
          .collect::<Vec<_>>();
      let app_state_record = layout_repo
          .get_app_state(canvas_id)
          .map_err(|error| error.to_string())?;
      let (viewport, app_state) = viewport_from_app_state(&app_state_record);

      // Precompute lighting per lighting-source operator so the read-only viewer
      // can light the timeline without a query engine. Lighting sources are the
      // trans-temporal operator entity types (contracts §2.1 / §8.2):
      // Archetype, Dynamic, PsychoidOperator. We enumerate by entity_type (NOT by
      // !is_temporal) and call archetypal_lighting once per operator, keying the
      // index by operatorGraphNodeId. NOTE: list_nodes_for_lens("canvas") returns
      // only :TheoryNode nodes, so Archetype/Dynamic are covered here; seeded
      // :Operator PsychoidOperator nodes require the WS2 bulk method noted in the
      // task header to be lit.
      const LIGHTING_SOURCE_TYPES: [&str; 3] = ["Archetype", "Dynamic", "PsychoidOperator"];
      let mut lighting_index: std::collections::BTreeMap<String, Vec<BundleLitInstance>> =
          std::collections::BTreeMap::new();
      for node in nodes
          .iter()
          .filter(|node| LIGHTING_SOURCE_TYPES.contains(&node.entity_type.as_str()))
      {
          let lighting = graph_repo.archetypal_lighting(&node.graph_node_id).await?;
          if lighting.instances.is_empty() {
              continue;
          }
          let instances = lighting
              .instances
              .into_iter()
              .map(|instance| BundleLitInstance {
                  node: instance.node,
                  rel_type: instance.rel_type,
                  dominance: instance.dominance,
              })
              .collect::<Vec<_>>();
          lighting_index.insert(node.graph_node_id.clone(), instances);
      }

      Ok(GraphExportBundle {
          generated_at: chrono::Utc::now().to_rfc3339(),
          project: project_json,
          canvas_id: canvas_id.to_string(),
          nodes,
          relationships,
          node_layout,
          edge_layout,
          viewport,
          app_state,
          lighting_index,
          assets: Vec::new(),
      })
  }

  pub fn serialize_graph_bundle(bundle: &GraphExportBundle) -> Result<String, String> {
      serde_json::to_string_pretty(bundle).map_err(|error| error.to_string())
  }
  ```

  > `chrono` is already a dependency of the Rust crate (used elsewhere for RFC3339 timestamps). If `cargo` reports `unresolved import chrono`, add `chrono = { version = "0.4", features = ["serde"] }` to `apps/desktop/src-tauri/Cargo.toml` `[dependencies]` and re-run.

  > **Lighting-index population is mandatory, not optional.** The `for node in nodes.iter().filter(|node| LIGHTING_SOURCE_TYPES.contains(&node.entity_type.as_str()))` loop above is what fills `lighting_index`; the web viewer's `archetypalLighting` (Task 4) reads only from this index, so omitting or weakening this loop makes the web timeline lighting render empty. Verify by inspection that every `Archetype`/`Dynamic`/`PsychoidOperator` operator returned by `list_nodes_for_lens("canvas")` is passed to `archetypal_lighting` and that non-empty results are inserted keyed by `graph_node_id`.

- [ ] 8.6 Run the test, expect PASS:
  ```bash
  cargo test --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml" graph_bundle_export -- --test-threads=1
  ```
  Expected output: `test serialized_bundle_uses_camel_case_keys ... ok`, `test result: ok. 1 passed`.

- [ ] 8.7 Write the failing lighting-index integration test. The unit test above (8.2) deliberately uses an empty `lightingIndex` and runs without Neo4j, so it does **not** prove the population step works. This test does: it seeds a real `Archetype`/`Dynamic` operator plus N datable instances that `INSTANTIATES` it (via the WS2 `GraphRepository`), runs the live `build_graph_bundle`, and asserts `lighting_index[operatorId]` contains exactly those N instances. It is env-gated on Neo4j with the same `support::neo4j_test_graph()` guard WS2's graph tests use (Task 11 / Task 13), and reuses WS2's temp-SQLite + canvas-row setup (Task 13's `canvas_view_join` pattern). Create `apps/desktop/src-tauri/tests/graph_bundle_lighting_index.rs`:
  ```rust
  // Integration test (env-gated on Neo4j): build_graph_bundle POPULATES
  // lightingIndex by enumerating Archetype/Dynamic operators and calling
  // archetypal_lighting once per operator (the load-bearing population step the
  // backend-less web timeline reads). Without it, lightingIndex ships empty.
  mod support;
  use neo4rs::query;
  use research_canvas_desktop_lib::db::{
      connection::Database,
      repositories::{
          graph::{GraphRepository, NewGraphNode},
          ProjectRepository,
      },
  };
  use research_canvas_desktop_lib::export::graph_bundle::build_graph_bundle;
  use tempfile::tempdir;

  #[test]
  fn build_graph_bundle_populates_lighting_index_for_seeded_operator() {
      let Some((graph, run_id, database)) = support::neo4j_test_graph() else {
          eprintln!("skipping: NEO4J_TEST_URI unset");
          return;
      };

      // SQLite layout in a temp dir + a real canvas row (WS2 Task 13 pattern).
      let dir = tempdir().unwrap();
      let db_path = dir.path().join("t.db");
      let db = Database::open(&db_path).unwrap();
      let project = ProjectRepository::new(db.connection())
          .create(
              "P".into(),
              "p".into(),
              None,
              dir.path().to_str().unwrap().into(),
              None,
              None,
              serde_json::json!({}),
          )
          .unwrap();
      let canvas_id = project.primary_canvas_id.unwrap();

      // One trans-temporal operator (Dynamic) + N datable instances INSTANTIATES it.
      let repo = GraphRepository::new(graph.clone(), database.clone());
      support::block_on(repo.ensure_schema()).expect("schema");
      let operator = support::block_on(repo.create_node(NewGraphNode {
          entity_type: "Dynamic".into(),
          title: format!("Monopoly mechanism {run_id}"),
          body: "[]".into(),
          coordinate: None,
          source_coordinates: vec![],
          is_temporal: false,
          valid_from: None,
          valid_to: None,
          temporal_precision: None,
      }))
      .expect("operator");

      let mut instance_ids = Vec::new();
      for (i, year) in ["1602", "1621", "1799"].iter().enumerate() {
          let event = support::block_on(repo.create_node(NewGraphNode {
              entity_type: "Event".into(),
              title: format!("Instance {i} {run_id}"),
              body: "[]".into(),
              coordinate: None,
              source_coordinates: vec![],
              is_temporal: true,
              valid_from: Some((*year).into()),
              valid_to: Some((*year).into()),
              temporal_precision: Some("year".into()),
          }))
          .expect("event");
          support::block_on(repo.connect_nodes(
              &event.graph_node_id,
              &operator.graph_node_id,
              "INSTANTIATES",
              serde_json::json!({ "dominance": "dominant" }),
          ))
          .expect("connect");
          instance_ids.push(event.graph_node_id);
      }
      let expected_n = instance_ids.len();

      // Build the bundle against the live graph + the temp SQLite connection.
      let bundle = support::block_on(build_graph_bundle(
          &repo,
          db.connection(),
          &canvas_id,
          serde_json::json!({ "id": project.id, "displayName": "Antichrist" }),
      ))
      .expect("build bundle");

      // The load-bearing assertion: lighting_index is keyed by the operator's
      // graph_node_id and carries exactly the N seeded instances.
      let lit = bundle
          .lighting_index
          .get(&operator.graph_node_id)
          .expect("operator must appear in lighting_index");
      assert_eq!(lit.len(), expected_n, "all seeded instances are lit");
      for id in &instance_ids {
          assert!(
              lit.iter().any(|inst| &inst.node.graph_node_id == id),
              "instance {id} present in lighting_index"
          );
      }
      assert!(
          lit.iter().all(|inst| inst.rel_type == "INSTANTIATES"),
          "rel_type carried through"
      );
      assert!(
          lit.iter()
              .all(|inst| inst.dominance.as_deref() == Some("dominant")),
          "dominance carried through"
      );

      // Cleanup.
      let mut all_ids = instance_ids;
      all_ids.push(operator.graph_node_id);
      for id in all_ids {
          support::block_on(async {
              graph
                  .run_on(
                      &database,
                      query("MATCH (n {graph_node_id: $id}) DETACH DELETE n").param("id", id),
                  )
                  .await
                  .expect("cleanup");
          });
      }
  }
  ```

  > This reuses the same `support` test module WS2 introduced (`apps/desktop/src-tauri/tests/support.rs`, WS2 Task 4: `neo4j_test_graph()` → `Option<(SharedGraph, run_id, database)>` and `block_on`). The `mod support;` line compiles the shared helper into this test binary exactly as WS2's `graph_lighting.rs` / `canvas_view_join.rs` do. The test is **gated**: it early-returns when `NEO4J_TEST_URI` is unset, so it is a no-op in CI without Neo4j and exercises real population when Neo4j is up.

- [ ] 8.8 Run the lighting-index test, expect FAIL:
  ```bash
  cd "/Users/admin/Documents/Antichrist Project" && set -a && . ./.env && set +a && NEO4J_TEST_URI="$NEO4J_URI" cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml graph_bundle_lighting_index -- --test-threads=1
  ```
  Expected output (the test file is new): compile error `cannot find function build_graph_bundle` / `unresolved import research_canvas_desktop_lib::export::graph_bundle` until step 8.5's `build_graph_bundle` is in place. If 8.5 already landed in this session, the failure is instead a genuine assertion failure only if the population loop is missing or weakened (the guard in §8.5 makes that loop mandatory).

- [ ] 8.9 Run the lighting-index test, expect PASS (the population loop in step 8.5's `build_graph_bundle` satisfies it):
  ```bash
  cd "/Users/admin/Documents/Antichrist Project" && set -a && . ./.env && set +a && NEO4J_TEST_URI="$NEO4J_URI" cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml graph_bundle_lighting_index -- --test-threads=1 --nocapture
  ```
  Expected output: `test build_graph_bundle_populates_lighting_index_for_seeded_operator ... ok` (or `skipping: NEO4J_TEST_URI unset` if Neo4j is not running — the gate, not a failure). This proves the lighting index is populated end-to-end: substance + relationships → `archetypal_lighting` → `lighting_index[operatorId]`.

- [ ] 8.10 Commit:
  ```bash
  git add apps/desktop/src-tauri/src/export/graph_bundle.rs apps/desktop/src-tauri/src/export/mod.rs apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/tests/graph_bundle_export.rs apps/desktop/src-tauri/tests/graph_bundle_lighting_index.rs apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock
  git commit -m "feat(desktop): build_graph_bundle joins Neo4j substance with SQLite layout into web bundle

Populates lightingIndex by enumerating Archetype/Dynamic operators and calling
archetypal_lighting per operator; env-gated integration test proves N seeded
instances land in lighting_index[operatorId].

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 9 — Tauri command `export_graph_bundle_command` + write to disk

Expose the bundle build/serialize as a Tauri command that writes `graph-bundle.json` into a chosen output directory, so the desktop app can produce the self-contained dataset the web build reads. Depends on Task 8 and on the app's managed Neo4j `SharedGraph` + SQLite connection (WS2 wiring).

**Files:**
- Create: `apps/desktop/src-tauri/src/commands/export_graph_bundle.rs`
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs` (add `pub mod export_graph_bundle;`)
- Modify: `apps/desktop/src-tauri/src/lib.rs` (register `export_graph_bundle_command` in `tauri::generate_handler!`)
- Create: `apps/desktop/src-tauri/tests/export_graph_bundle_command.rs`

**Interfaces:**
- Consumes:
  - Task 8: `crate::export::graph_bundle::{build_graph_bundle, serialize_graph_bundle, GraphExportBundle}`.
  - WS2 managed state: `crate::db::neo4j::SharedGraph` and the SQLite connection accessor used by existing commands (mirror the pattern in `apps/desktop/src-tauri/src/commands/projects.rs` — confirm its connection-acquisition helper name before writing the command).
- Produces:
  - `pub fn write_graph_bundle(bundle: &GraphExportBundle, output_dir: &std::path::Path) -> Result<std::path::PathBuf, String>` (pure, unit-testable)
  - `#[tauri::command] pub async fn export_graph_bundle_command(...) -> Result<String, String>` (returns the written file path)

**Steps:**

- [ ] 9.1 Write the failing test for the pure writer. Create `apps/desktop/src-tauri/tests/export_graph_bundle_command.rs`:
  ```rust
  use std::fs;

  use research_canvas_desktop_lib::commands::export_graph_bundle::write_graph_bundle;
  use research_canvas_desktop_lib::export::graph_bundle::GraphExportBundle;

  #[test]
  fn writes_graph_bundle_json_to_output_dir() {
      let json_value = serde_json::json!({
          "generatedAt": "2026-06-28T12:00:00Z",
          "project": { "id": "p1", "displayName": "Antichrist" },
          "canvasId": "c1",
          "nodes": [],
          "relationships": [],
          "nodeLayout": [],
          "edgeLayout": [],
          "viewport": { "x": 0.0, "y": 0.0, "zoom": 1.0 },
          "appState": {},
          "lightingIndex": {},
          "assets": []
      });
      let bundle: GraphExportBundle =
          serde_json::from_value(json_value).expect("deserialize bundle");

      let temp_dir = std::env::temp_dir().join(format!(
          "antichrist-bundle-{}",
          std::process::id()
      ));
      fs::create_dir_all(&temp_dir).expect("create temp dir");

      let written = write_graph_bundle(&bundle, &temp_dir).expect("write bundle");
      assert!(written.ends_with("graph-bundle.json"));
      assert!(written.exists());

      let contents = fs::read_to_string(&written).expect("read written file");
      assert!(contents.contains("\"canvasId\""));
      assert!(contents.contains("\"lightingIndex\""));

      fs::remove_dir_all(&temp_dir).ok();
  }
  ```

  > The crate library name is `research_canvas_desktop_lib` — verified against `[lib] name` in `apps/desktop/src-tauri/Cargo.toml`. Re-confirm there and substitute only if a future rename changes it.

- [ ] 9.2 Run the test, expect FAIL:
  ```bash
  cargo test --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml" export_graph_bundle_command -- --test-threads=1
  ```
  Expected output: compile error `unresolved import research_canvas_desktop_lib::commands::export_graph_bundle`.

- [ ] 9.3 Wire the module. Add `pub mod export_graph_bundle;` to `apps/desktop/src-tauri/src/commands/mod.rs` (next to the other `pub mod` lines).

- [ ] 9.4 Implement the command file. Create `apps/desktop/src-tauri/src/commands/export_graph_bundle.rs`:
  ```rust
  use std::path::{Path, PathBuf};

  use serde::Deserialize;
  use tauri::State;

  use crate::export::graph_bundle::{
      build_graph_bundle, serialize_graph_bundle, GraphExportBundle,
  };

  #[derive(Debug, Deserialize)]
  #[serde(rename_all = "camelCase")]
  pub struct ExportGraphBundleRequest {
      pub database_path: String,
      pub canvas_id: String,
      pub output_dir: String,
      pub project_json: serde_json::Value,
  }

  /// Pure, unit-testable writer: serialize the bundle and write graph-bundle.json.
  pub fn write_graph_bundle(
      bundle: &GraphExportBundle,
      output_dir: &Path,
  ) -> Result<PathBuf, String> {
      std::fs::create_dir_all(output_dir).map_err(|error| error.to_string())?;
      let serialized = serialize_graph_bundle(bundle)?;
      let target = output_dir.join("graph-bundle.json");
      std::fs::write(&target, serialized).map_err(|error| error.to_string())?;
      Ok(target)
  }

  #[tauri::command]
  pub async fn export_graph_bundle_command(
      request: ExportGraphBundleRequest,
      graph: State<'_, crate::db::neo4j::SharedGraph>,
  ) -> Result<String, String> {
      // Build the GraphRepository against the managed Neo4j graph.
      let graph_repo = crate::db::repositories::graph::GraphRepository::new(
          graph.inner().clone(),
          std::env::var("NEO4J_DATABASE").unwrap_or_else(|_| "neo4j".to_string()),
      );

      // Open the SQLite connection for layout, mirroring the existing command pattern.
      let connection = rusqlite::Connection::open(&request.database_path)
          .map_err(|error| error.to_string())?;

      let bundle = build_graph_bundle(
          &graph_repo,
          &connection,
          &request.canvas_id,
          request.project_json,
      )
      .await?;

      let written = write_graph_bundle(&bundle, Path::new(&request.output_dir))?;
      Ok(written.to_string_lossy().to_string())
  }
  ```

  > The exact managed-state type for the Neo4j graph (`State<'_, crate::db::neo4j::SharedGraph>`) and the SQLite connection-acquisition pattern must match WS2's `lib.rs` setup. If WS2 stores the graph behind a wrapper (e.g. `State<'_, AppNeo4j>`), adjust the parameter type and `.inner().clone()` accordingly. The pure `write_graph_bundle` is what the test in 9.1 exercises; the `#[tauri::command]` is integration-wired in 9.5.

- [ ] 9.5 Register the command. Open `apps/desktop/src-tauri/src/lib.rs`, find the `tauri::generate_handler![ ... ]` macro invocation, and add `commands::export_graph_bundle::export_graph_bundle_command,` to the list (keep trailing comma style consistent with the surrounding entries).

- [ ] 9.6 Run the test, expect PASS:
  ```bash
  cargo test --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml" export_graph_bundle_command -- --test-threads=1
  ```
  Expected output: `test writes_graph_bundle_json_to_output_dir ... ok`, `test result: ok. 1 passed`.

- [ ] 9.7 Confirm the whole Rust crate still compiles and its tests pass:
  ```bash
  cargo test --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml" -- --test-threads=1
  ```
  Expected output: `test result: ok` for every test binary, `0 failed`.

- [ ] 9.8 Commit:
  ```bash
  git add apps/desktop/src-tauri/src/commands/export_graph_bundle.rs apps/desktop/src-tauri/src/commands/mod.rs apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/tests/export_graph_bundle_command.rs
  git commit -m "feat(desktop): export_graph_bundle_command writes graph-bundle.json for the web read-layer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 10 — Add the TS transport-selector for the static web target

`createWorkspaceTransport()` currently chooses Tauri vs browser-bridge by runtime (line 175–179). The static web build needs to select `createStaticBundleTransport` when a graph bundle is present. Add a thin selector so the web app picks the static transport, keeping all data access behind `WorkspaceTransport` (design §3.2 / §6).

**Files:**
- Modify: `packages/desktop-api/src/index.ts` (add `createReadLayerTransport` after `createWorkspaceTransport`, which ends at line 179)
- Create: `packages/desktop-api/src/readLayerTransport.test.ts`

**Interfaces:**
- Consumes: Task 1 `GraphExportBundle`; Task 4 `createStaticBundleTransport`; existing `createWorkspaceTransport`.
- Produces: `function createReadLayerTransport(bundle: GraphExportBundle | null): WorkspaceTransport` — returns the static-bundle transport when a bundle is given, otherwise falls back to `createWorkspaceTransport()`.

**Steps:**

- [ ] 10.1 Write the failing test. Create `packages/desktop-api/src/readLayerTransport.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";

  import type { GraphExportBundle } from "@research-canvas/exporter";

  import { createReadLayerTransport } from "./index";

  function bundle(): GraphExportBundle {
    return {
      generatedAt: "2026-06-28T12:00:00Z",
      project: {
        coverAssetPath: null,
        createdAt: "t",
        displayName: "Antichrist",
        id: "11111111-1111-4111-8111-111111111111",
        parentProjectId: null,
        primaryCanvasId: "c1",
        publishSettings: { includeResources: true, mobileSequenceFirst: true, theme: "paper" },
        rootPath: "/tmp/antichrist",
        slug: "antichrist",
        summary: "Theory graph",
        updatedAt: "t"
      },
      canvasId: "c1",
      nodes: [
        {
          graphNodeId: "n1",
          entityType: "Event",
          title: "Banda genocide",
          body: "[]",
          summary: "1621",
          archetypalResonance: null,
          coordinate: null,
          sourceCoordinates: [],
          isTemporal: true,
          validFrom: "1621-01-01",
          validTo: null,
          temporalPrecision: "year",
          createdAt: "t",
          updatedAt: "t"
        }
      ],
      relationships: [],
      nodeLayout: [],
      edgeLayout: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      appState: {},
      lightingIndex: {},
      assets: []
    };
  }

  describe("createReadLayerTransport", () => {
    it("returns a read-only static-bundle transport when a bundle is provided", async () => {
      const transport = createReadLayerTransport(bundle());
      const node = await transport.readGraphNode({ graphNodeId: "n1" });
      expect(node.title).toBe("Banda genocide");
      await expect(
        transport.createGraphNode({ entityType: "Event", title: "x", body: "[]", isTemporal: true })
      ).rejects.toThrow("read-only web build");
    });

    it("falls back to the runtime transport when no bundle is provided", () => {
      const transport = createReadLayerTransport(null);
      // In jsdom there is no Tauri runtime, so the browser-bridge transport is returned.
      // We only assert it exposes the read-graph method (interface conformance), not network behavior.
      expect(typeof transport.readGraphNode).toBe("function");
    });
  });
  ```

- [ ] 10.2 Run the test, expect FAIL:
  ```bash
  pnpm vitest run packages/desktop-api/src/readLayerTransport.test.ts
  ```
  Expected output: failure with `createReadLayerTransport is not a function`.

- [ ] 10.3 Implement the selector. Open `packages/desktop-api/src/index.ts` and add, immediately after `createWorkspaceTransport` (after line 179):
  ```ts
  export function createReadLayerTransport(
    bundle: GraphExportBundle | null
  ): WorkspaceTransport {
    if (bundle) {
      return createStaticBundleTransport(bundle);
    }

    return createWorkspaceTransport();
  }
  ```

  > This references `GraphExportBundle` and `createStaticBundleTransport`, both already imported/defined in this file by Tasks 1 and 4. If the `import type { GraphExportBundle }` line is not yet at module top, ensure it is (Task 4 step 4.5 note).

- [ ] 10.4 Run the test, expect PASS:
  ```bash
  pnpm vitest run packages/desktop-api/src/readLayerTransport.test.ts
  ```
  Expected output: `2 passed`.

- [ ] 10.5 Commit:
  ```bash
  git add packages/desktop-api/src/index.ts packages/desktop-api/src/readLayerTransport.test.ts
  git commit -m "feat(desktop-api): createReadLayerTransport selects static-bundle vs runtime transport

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 11 — Repo doc: setup (Docker + Neo4j + Graphiti, Gemini keys, terminal + MCP)

Spec §7 requires a setup doc. Write it from the contracts §1 (connection config, docker-compose) and §6 (MCP topology). It is verifiable by a presence/keyword test so it cannot silently rot to placeholder content.

**Files:**
- Create: `docs/setup.md`
- Create: `tests/docs/setup-doc.test.ts`

**Interfaces:**
- Consumes: contracts §1 env-var table (`NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`, `GOOGLE_API_KEY`, `GRAPHITI_LLM_MODEL`, `GRAPHITI_EMBEDDER_MODEL`, `GRAPHITI_RERANKER_MODEL`) and the docker-compose service shape.
- Produces: `docs/setup.md`.

**Steps:**

- [ ] 11.1 Write the failing test. Create `tests/docs/setup-doc.test.ts`:
  ```ts
  import fs from "node:fs";
  import path from "node:path";

  import { describe, expect, it } from "vitest";

  const setupPath = path.resolve("docs/setup.md");

  describe("docs/setup.md", () => {
    it("exists and documents the required env vars and services", () => {
      expect(fs.existsSync(setupPath)).toBe(true);
      const content = fs.readFileSync(setupPath, "utf8");

      for (const token of [
        "NEO4J_URI",
        "NEO4J_PASSWORD",
        "GOOGLE_API_KEY",
        "GRAPHITI_LLM_MODEL",
        "docker-compose",
        "gemini-2.5-flash",
        "Graphiti MCP",
        "research-canvas",
        "7687"
      ]) {
        expect(content).toContain(token);
      }
    });
  });
  ```

- [ ] 11.2 Add the docs glob to the Vitest include so the test is picked up. Open `vitest.config.ts` and change the `include` array from:
  ```ts
      include: [
        "packages/**/*.test.ts",
        "packages/**/*.test.tsx",
        "apps/**/*.test.ts",
        "apps/**/*.test.tsx"
      ],
  ```
  to:
  ```ts
      include: [
        "packages/**/*.test.ts",
        "packages/**/*.test.tsx",
        "apps/**/*.test.ts",
        "apps/**/*.test.tsx",
        "tests/docs/**/*.test.ts"
      ],
  ```

- [ ] 11.3 Run the test, expect FAIL:
  ```bash
  pnpm vitest run tests/docs/setup-doc.test.ts
  ```
  Expected output: failure on `expect(fs.existsSync(setupPath)).toBe(true)` (file does not exist).

- [ ] 11.4 Write the doc. Create `docs/setup.md`:
  ```markdown
  # Setup

  This is a local-first tool. Distribution is "clone the repo and run it" — there are no packaged installers. This document gets a fresh machine to a running desktop app with a live Neo4j graph and the research agent wired in.

  ## Prerequisites

  - Node 20+ and `pnpm` 10+ (`corepack enable` then `corepack prepare pnpm@10.25.0 --activate`).
  - Rust toolchain (`rustup`, stable) and the Tauri v2 system dependencies for your OS.
  - Docker + Docker Compose (for Neo4j).
  - Python 3.11+ (for the Graphiti MCP server).
  - A Google Gemini API key.

  ## 1. Install JS dependencies

  ```bash
  pnpm install
  ```

  ## 2. Environment

  Copy the example env file and fill in the secrets. `.env` is git-ignored; `.env.example` is committed with blanks.

  ```bash
  cp .env.example .env
  ```

  | Env var | Default | Used by |
  |---|---|---|
  | `NEO4J_URI` | `bolt://127.0.0.1:7687` | Rust app (`neo4rs`), Graphiti MCP |
  | `NEO4J_USER` | `neo4j` | both |
  | `NEO4J_PASSWORD` | (required, set your own) | both |
  | `NEO4J_DATABASE` | `neo4j` | both |
  | `GOOGLE_API_KEY` | (required for Graphiti) | Graphiti MCP only |
  | `GRAPHITI_LLM_MODEL` | `gemini-2.5-flash` | Graphiti MCP only |
  | `GRAPHITI_EMBEDDER_MODEL` | `gemini-embedding-001` | Graphiti MCP only |
  | `GRAPHITI_RERANKER_MODEL` | `gemini-2.5-flash-lite` | Graphiti MCP only |

  Both the Tauri app and the Graphiti MCP server load this same `.env`.

  ## 3. Start Neo4j (Docker)

  The repo ships a single-service `docker-compose.yml` at its root:

  ```bash
  docker compose up -d neo4j
  ```

  This starts `neo4j:5.26-community` with APOC enabled, exposing the browser UI on `http://127.0.0.1:7474` and the bolt protocol on `127.0.0.1:7687`. Graphiti requires Neo4j 5.26+.

  ## 4. Run the desktop app

  ```bash
  pnpm launch
  ```

  On startup the app connects to Neo4j over bolt via `neo4rs`, runs the idempotent schema setup (constraints + indexes), and reads layout from local SQLite.

  ## 5. Wire the research agent (terminal + MCP)

  Theory authoring is done by a terminal coding agent (Claude Code / Codex) running on your existing subscription, through two MCP servers:

  - **Graphiti MCP** (Python, external) is the agent's theory-write path. It runs Graphiti's ingestion pipeline (Gemini LLM + embeddings) and writes nodes/episodes/relationships with provenance into the same Neo4j database. Configure it with the `NEO4J_*`, `GOOGLE_API_KEY`, and `GRAPHITI_*` env vars above.
  - **research-canvas MCP** (this repo, `.claude/mcp-servers/research-canvas`) is slimmed to a place-on-canvas / layout role. It does not author theory; it places existing graph nodes (by `graphNodeId`) onto the canvas/timeline and reads/updates their layout. Its HTTP API listens on `http://127.0.0.1:9876`.

  The agent loop: research with Graphiti MCP (which writes substance), then place new nodes on the canvas/timeline with the research-canvas MCP, then review and refine in the desktop UI.

  ## 6. Verify

  ```bash
  pnpm exec tsc -b
  pnpm vitest run
  cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml -- --test-threads=1
  ```

  See `docs/architecture.md` for how the pieces fit together and `docs/data-model.md` for the graph ontology.
  ```

- [ ] 11.5 Run the test, expect PASS:
  ```bash
  pnpm vitest run tests/docs/setup-doc.test.ts
  ```
  Expected output: `1 passed`.

- [ ] 11.6 Commit:
  ```bash
  git add docs/setup.md tests/docs/setup-doc.test.ts vitest.config.ts
  git commit -m "docs: setup guide (Docker+Neo4j+Graphiti, Gemini keys, terminal+MCP wiring)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 12 — Repo docs: architecture + data model/ontology

Spec §7 requires an architecture doc (this spec distilled) and a data-model/ontology doc (entity + relationship types, the coordinate grammar, the seeded operators). Both are derived from contracts §2 and design §3–§4 and guarded by a keyword test.

**Files:**
- Create: `docs/architecture.md`
- Create: `docs/data-model.md`
- Create: `tests/docs/architecture-and-datamodel-doc.test.ts`

**Interfaces:**
- Consumes: contracts §2 (labels, properties, relationship types), §3 (SQLite layout), §8 (two-lens); design §3–§4.
- Produces: `docs/architecture.md`, `docs/data-model.md`.

**Steps:**

- [ ] 12.1 Write the failing test. Create `tests/docs/architecture-and-datamodel-doc.test.ts`:
  ```ts
  import fs from "node:fs";
  import path from "node:path";

  import { describe, expect, it } from "vitest";

  describe("docs/architecture.md", () => {
    it("documents the two-store split and the transport seam", () => {
      const content = fs.readFileSync(path.resolve("docs/architecture.md"), "utf8");
      for (const token of [
        "Neo4j",
        "SQLite",
        "graph_node_id",
        "WorkspaceTransport",
        "static export",
        "canvas",
        "timeline"
      ]) {
        expect(content).toContain(token);
      }
    });
  });

  describe("docs/data-model.md", () => {
    it("documents entity types, relationship types, and the coordinate grammar", () => {
      const content = fs.readFileSync(path.resolve("docs/data-model.md"), "utf8");
      for (const token of [
        "TheoryNode",
        "Archetype",
        "PsychoidOperator",
        "INSTANTIATES",
        "is_temporal",
        "source_coordinates",
        "archetypal_resonance"
      ]) {
        expect(content).toContain(token);
      }
    });
  });
  ```

- [ ] 12.2 Run the test, expect FAIL:
  ```bash
  pnpm vitest run tests/docs/architecture-and-datamodel-doc.test.ts
  ```
  Expected output: failure with `ENOENT: no such file or directory, open '.../docs/architecture.md'`.

- [ ] 12.3 Write the architecture doc. Create `docs/architecture.md`:
  ```markdown
  # Architecture

  A local-first tool for developing the theoretical and historical narrative of the *Image of the Antichrist* video series. The theory lives in a graph; the tool constructs, edits, and navigates that graph through two lenses (canvas + timeline). The web build is a read/display layer over the same data.

  ## One substrate, two stores

  - **Neo4j + Graphiti = theory substance.** Node bodies (the writing), relationships, archetypal links, temporal validity, provenance. Graphiti gives bi-temporal modeling, episodic ingestion, dedup, and hybrid retrieval, driven by Gemini (`gemini-2.5-flash` LLM, `gemini-embedding-001` embedder).
  - **SQLite = presentation only.** Canvas node positions/sizes/styles, viewport, panel/app-state. Each layout row carries a `graph_node_id` pointing at the Neo4j node it lays out. Layout is never written into the knowledge graph.

  The two stores are joined **only** by `graph_node_id` (an app-minted UUIDv4 that is the Neo4j node's stable id and the SQLite layout row's key). The join is performed in the Rust repository layer and re-exposed to the frontend already joined — the app never joins across the database boundary in SQL.

  ## Process topology

  - **Tauri desktop app (Rust)** talks bolt directly to local Neo4j via the `neo4rs` crate for substance CRUD, reads layout from SQLite, performs the join, and serves the frontend through typed Tauri IPC commands.
  - **Terminal agent (Claude Code / Codex)** authors theory through the **Graphiti MCP server** (entity extraction, dedup, provenance, embeddings) and places nodes on the canvas/timeline through the slimmed **research-canvas MCP**.

  ## The transport seam (web reuse)

  All frontend data access goes through the `WorkspaceTransport` interface (`packages/desktop-api`). View components never call Tauri or a DB driver directly. This is what lets the web build reuse the same canvas/timeline view code:

  - **Desktop**: routes through Tauri/native against live Neo4j (read + write).
  - **Web read-layer**: `createStaticBundleTransport` serves all reads from an exported `GraphExportBundle` JSON dataset with no backend, and throws `read-only web build` on every mutation. `createReadLayerTransport(bundle)` selects it.

  ## Static export (web read-layer)

  The desktop app serializes Neo4j substance joined with SQLite layout into a self-contained `GraphExportBundle` (`graph-bundle.json`) via `export_graph_bundle_command`. The `public-viewer` app loads that bundle and renders the **canvas lens** (read-only) and the **timeline lens** (with archetypal lighting) from it — both through the same `WorkspaceTransport` read interface. A hosted read-only Neo4j is a later option behind the same seam; it is not required for v1.

  ## The two lenses

  - **Canvas lens** shows **all** nodes (`loadCanvasView({ lens: "canvas" })`) — the trans-temporal, spatial view for building the archetypal/logical narrative.
  - **Timeline lens** shows **only** temporally-located nodes (`loadCanvasView({ lens: "timeline" })`, server-filtered on `is_temporal`). Selecting a trans-temporal operator lights up every datable instance it `INSTANTIATES`/`ECHOES` across the timeline (archetypal lighting).

  A node is the same full document in either lens; opening it is identical.

  See `docs/data-model.md` for the graph ontology and `docs/setup.md` to run it.
  ```

- [ ] 12.4 Write the data-model doc. Create `docs/data-model.md`:
  ```markdown
  # Data model / ontology

  The archetypal is **relational, not a property**: the archetypal field is modeled by relating theory nodes to real operator nodes, not by stamping flat tags.

  ## Node labels

  Every theory node carries `:TheoryNode` plus exactly one entity-type label. Seeded operators carry `:Operator` + their type label (they are canonical references, not authored theory).

  | Entity-type label | `:TheoryNode` | Temporal character | Lens |
  |---|---|---|---|
  | `Figure` | yes | temporal (lifespan) | timeline + canvas |
  | `People` | yes | temporal (span) | timeline + canvas |
  | `Event` | yes | temporal (point/span) | timeline + canvas |
  | `Institution` | yes | temporal (founded→) | timeline + canvas |
  | `Source` | yes | temporal + provenance | timeline + canvas |
  | `Place` | yes | mostly atemporal | canvas (timeline if dated) |
  | `Work` | yes | trans-temporal | canvas |
  | `Archetype` | yes | trans-temporal | canvas (lighting source) |
  | `Dynamic` | yes | trans-temporal | canvas (lighting source) |
  | `PsychoidOperator` | no (`:Operator`) | atemporal (seeded) | canvas (lighting source) |

  ## Common properties (every `:TheoryNode`)

  - `graph_node_id` (string, UUIDv4) — the PK for the SQLite layout join. App-minted, unique.
  - `title`, `body` (BlockNote/ProseMirror doc JSON, stored as a string; empty doc is `"[]"`), `summary`.
  - `archetypal_resonance` — the one allowed archetypal **summary** property: a regenerable plain-language caption that aggregates a node's relational reach. It is **not** the data store for archetypal structure — the relations are.
  - `coordinate` (string | null) — standalone Bimba ground reference, no family prefix (e.g. `"#2"`).
  - `source_coordinates` (string[]) — multi-form links to canonical operator/coordinate nodes, e.g. `["#2","L2","C3"]`. Always an array.
  - `created_at`, `updated_at` (RFC3339).

  ## Temporal-validity properties

  Present on temporally-located nodes; absent/null on trans-temporal nodes (that absence is the two-lens signal):

  - `valid_from`, `valid_to` (ISO-8601 | null).
  - `temporal_precision` (`"year"|"month"|"day"|"decade"|"century"|"millennium"`).
  - `is_temporal` (boolean) — the discriminator the frontend keys on. `true` ⇒ project onto the timeline. Defaults true for Figure/People/Event/Institution/Source; false for Work/Archetype/Dynamic/Place/PsychoidOperator; authorable per-node.

  ## Relationship types (directed, SCREAMING_SNAKE)

  - `INSTANTIATES` — **the spine.** A datable instance realizes a trans-temporal pattern. Powers archetypal lighting. Carries `dominance` (`"dominant"|"secondary"`).
  - `ECHOES` — weaker recurrence than `INSTANTIATES`; treated by the same lighting query.
  - `CAUSES` — direct historical consequence.
  - `INFLUENCES` — ideological/textual transmission.
  - `OPPOSES` — polarity (Christ ↔ Antichrist); read symmetrically.
  - `INHERITS` — lineage / dynastic / institutional succession.
  - `TRANSFORMS_INTO` — metamorphosis (visible empire → invisible governance).
  - `LOCATED_AT` — placement on a `Place`.
  - `SOURCED_FROM` — provenance to a `Source` (carries the Graphiti `episode_id`).
  - `RESONATES_WITH` — archetypal-field link to an `Archetype`/`PsychoidOperator`; read symmetrically.

  ## Coordinate grammar (seeded operators)

  Operator nodes are seeded from the canonical Epi-Logos / bimba source using the **same coordinate grammar** the Epi-Logos system uses, so a future merge into bimba is reconciliation, not migration:

  - QL positions: Psychoids `#0`–`#5` (`PsychoidOperator`, `operator_kind: "psychoid"`, `position: "#0".."#5"`).
  - MEF lenses: the `L` coordinate family (`operator_kind: "mef_lens"`).
  - Core `Archetype` nodes.

  Theory nodes link back to these via `source_coordinates[]` and the `RESONATES_WITH`/`INSTANTIATES`/`ECHOES` relationships.

  ## SQLite layout store

  Layout rows (`node_layout`, `edge_layout`, `canvas_app_state`) are keyed by `graph_node_id` and `canvas_id`. They hold position, size, style, viewport, and app-state only. Substance never leaks into these tables; layout never leaks into the graph.
  ```

- [ ] 12.5 Run the test, expect PASS:
  ```bash
  pnpm vitest run tests/docs/architecture-and-datamodel-doc.test.ts
  ```
  Expected output: `2 passed`.

- [ ] 12.6 Commit:
  ```bash
  git add docs/architecture.md docs/data-model.md tests/docs/architecture-and-datamodel-doc.test.ts
  git commit -m "docs: architecture + data-model/ontology guides

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 13 — Fix the stale `CLAUDE.md` ("not yet implemented" is wrong)

Spec §7 explicitly requires fixing the stale `CLAUDE.md`. It currently claims the app is "not yet implemented" and points at a 15-task plan; the app is substantially built and the data model is being cut over to Neo4j + SQLite. Update the overview, persistence, and architecture sections, and link the new docs. Guard the fix with a test so the false claim cannot return.

**Files:**
- Modify: `CLAUDE.md` (Project Overview lines 5–11; Data Persistence lines 83–85; add a "Documentation" pointer)
- Create: `tests/docs/claude-md.test.ts`

**Interfaces:**
- Consumes: design §2 (verified current state); contracts §0/§1/§3 (two-store model).
- Produces: corrected `CLAUDE.md`.

**Steps:**

- [ ] 13.1 Write the failing test. Create `tests/docs/claude-md.test.ts`:
  ```ts
  import fs from "node:fs";
  import path from "node:path";

  import { describe, expect, it } from "vitest";

  describe("CLAUDE.md", () => {
    const content = fs.readFileSync(path.resolve("CLAUDE.md"), "utf8");

    it("no longer claims the app is not yet implemented", () => {
      expect(content).not.toContain("not yet implemented");
      expect(content).not.toContain("The app is **not yet implemented**");
    });

    it("describes the two-store Neo4j + SQLite model and links the docs", () => {
      expect(content).toContain("Neo4j");
      expect(content).toContain("SQLite");
      expect(content).toContain("graph_node_id");
      expect(content).toContain("docs/architecture.md");
      expect(content).toContain("docs/data-model.md");
      expect(content).toContain("docs/setup.md");
    });
  });
  ```

- [ ] 13.2 Run the test, expect FAIL:
  ```bash
  pnpm vitest run tests/docs/claude-md.test.ts
  ```
  Expected output: failure on `expect(content).not.toContain("not yet implemented")` (the phrase is present at line 11).

- [ ] 13.3 Replace the Project Overview block. In `CLAUDE.md`, replace lines 5–11 (the `## Project Overview` body) — from:
  ```markdown
  ## Project Overview

  This is a dual-purpose repository:
  1. **Research content** — episode specifications and research logs for a series on archetypes and civilizational power structures (in `ep-0.1/`, `ep-0.2/`)
  2. **Research Canvas app** — a planned local-first Tauri v2 desktop application for organizing and presenting research through interactive visual graphs (implementation plan in `docs/plans/`)

  The app is **not yet implemented**. Start from `docs/plans/2026-03-30-research-canvas-implementation-plan.md` for the full 15-task build sequence.
  ```
  to:
  ```markdown
  ## Project Overview

  This is a dual-purpose repository:
  1. **Research content** — episode specifications and research logs for a series on archetypes and civilizational power structures (in `ep-0.1/`, `ep-0.2/`, `antichrist-vault/`)
  2. **Research Canvas app** — a local-first Tauri v2 desktop application for developing the theory of the *Image of the Antichrist* series as a knowledge graph, navigated through two lenses (a trans-temporal **canvas** and a temporal **timeline**), with a backend-less **web read-layer**.

  The app is **substantially built**: Tauri v2 + React 19 + Vite 7 shell, an XYFlow canvas, an embedded terminal, the `WorkspaceTransport` seam, the static exporter, and the `public-viewer` web app all exist. The data model is being cut over to **Neo4j + Graphiti** (theory substance) joined with **SQLite** (layout only) by `graph_node_id`. The authoritative contracts live in `docs/superpowers/plans/2026-06-28-ws0-contracts-and-architecture.md`; the design is `docs/superpowers/specs/2026-06-28-antichrist-theory-tool-design.md`.

  ## Documentation

  - `docs/setup.md` — clone-and-run: Docker + Neo4j + Graphiti, Gemini keys, terminal + MCP wiring.
  - `docs/architecture.md` — the two-store model, the transport seam, the two lenses, the web read-layer.
  - `docs/data-model.md` — entity + relationship types, the coordinate grammar, the seeded operators.
  ```

- [ ] 13.4 Replace the Data Persistence section. In `CLAUDE.md`, replace lines 83–85 (the `### Data Persistence` body) — from:
  ```markdown
  ### Data Persistence

  All authoring state (projects, nodes, edges, annotations, sequences) lives in SQLite. The frontend communicates exclusively through typed Tauri IPC commands defined in `packages/desktop-api`. Never bypass the repository layer to access SQLite directly from frontend code.
  ```
  to:
  ```markdown
  ### Data Persistence

  Two stores, cleanly split, joined only by `graph_node_id` (an app-minted UUIDv4). **Neo4j + Graphiti** holds theory substance (node bodies, relationships, temporal validity, provenance); **SQLite** holds presentation only (position, size, style, viewport, app-state), each layout row keyed by `graph_node_id`. The join is performed in the Rust repository layer and re-exposed to the frontend already joined — never join across the database boundary in SQL. The frontend communicates exclusively through the `WorkspaceTransport` interface (`packages/desktop-api`); the web build swaps in a read-only static-bundle transport. Never bypass the repository/transport layer to reach a database directly from frontend code.
  ```

- [ ] 13.5 Run the test, expect PASS:
  ```bash
  pnpm vitest run tests/docs/claude-md.test.ts
  ```
  Expected output: `2 passed`.

- [ ] 13.6 Commit:
  ```bash
  git add CLAUDE.md tests/docs/claude-md.test.ts
  git commit -m "docs: correct stale CLAUDE.md (app is built; two-store Neo4j+SQLite model)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Task 14 — Full WS7 verification gate

Run every WS7 test together, type-check, and confirm the Rust crate compiles, so the workstream is provably green before hand-off.

**Files:** none (verification only).

**Interfaces:** Consumes all prior tasks.

**Steps:**

- [ ] 14.1 Run all frontend tests touched/added by WS7:
  ```bash
  pnpm vitest run packages/exporter packages/desktop-api apps/public-viewer tests/docs
  ```
  Expected output: every test file passes, `0 failed`. The set includes `graphBundle.test.ts`, `blockNoteMarkdown.test.ts`, `graphTypes.test.ts`, `staticBundleTransport.test.ts`, `readLayerTransport.test.ts`, `CanvasLensView.test.tsx`, `TimelineLensView.test.tsx`, `GraphApp.test.tsx`, `setup-doc.test.ts`, `architecture-and-datamodel-doc.test.ts`, `claude-md.test.ts`, plus the pre-existing `manifest.test.ts` and `App.test.tsx`.

- [ ] 14.2 Type-check the workspace:
  ```bash
  pnpm exec tsc -b
  ```
  Expected output: completes with no errors (exit code 0, no `error TS` lines).

- [ ] 14.3 Compile + test the Rust crate (only if Tasks 8–9 ran; if WS2 was not yet landed and Tasks 8–9 were skipped, note that in the hand-off and skip this step):
  ```bash
  cargo test --manifest-path "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml" -- --test-threads=1
  ```
  Expected output: `test result: ok` for every test binary, including `graph_bundle_export`, `graph_bundle_lighting_index` (env-gated — prints `skipping: NEO4J_TEST_URI unset` and passes as a no-op when Neo4j is not running; run with `set -a && . ./.env && set +a && NEO4J_TEST_URI="$NEO4J_URI"` to exercise it live), and `export_graph_bundle_command`.

- [ ] 14.4 Commit any incidental lockfile/formatting changes surfaced by the gate, if any:
  ```bash
  git add -A
  git commit -m "chore(ws7): verification gate green (web read-layer + docs)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>" || echo "nothing to commit"
  ```

---

## Done When

- [ ] `packages/exporter/src/graphBundle.ts` exports `GraphExportBundle`, `graphExportBundleSchema`, `parseGraphExportBundle`, and rejects malformed bundles (Task 1 test green).
- [ ] `packages/exporter/src/renderMarkdown.ts` exports `blockNoteJsonToMarkdown` and `markdownToBlockNoteJson` per contracts §7, treating `""`/`"[]"` as empty and never throwing on malformed JSON (Task 2 test green).
- [ ] `@research-canvas/desktop-api` exports the WS0 §5.1 graph TS types and the §5.2 `WorkspaceTransport` graph methods (Task 3 + Task 4 interface extension).
- [ ] `createStaticBundleTransport(bundle)` serves `readGraphNode`, `searchGraph`, `loadCanvasView` (canvas = all nodes with synthesised default layout; timeline = `isTemporal` only), `archetypalLighting`, and `resonancesForInstance` from the bundle with **no backend**, and **every** mutation method throws `read-only web build` (Task 4 test green).
- [ ] The `public-viewer` renders a read-only **canvas lens** and a read-only **timeline lens with archetypal lighting** from a `GraphExportBundle`, both via `WorkspaceTransport` — never calling Tauri or a DB driver (Tasks 5–7 tests green).
- [ ] `GraphApp` defaults to the canvas lens, switches to the timeline lens, and loads the bundle from prop / bootstrap / `graph-bundle.json` fetch (Task 7 test green).
- [ ] The desktop Rust serializer `build_graph_bundle` joins `GraphRepository` substance with `LayoutRepository` layout **and populates** the `lightingIndex` (enumerating `Archetype`/`Dynamic`/`PsychoidOperator` operators from `list_nodes_for_lens("canvas")` and calling `archetypal_lighting` once per operator, keyed by `graphNodeId`) and serializes camelCase JSON the TS parser accepts; the env-gated integration test `graph_bundle_lighting_index` proves N seeded instances land in `lighting_index[operatorId]`; `export_graph_bundle_command` writes `graph-bundle.json` (Tasks 8–9 tests green; gated on WS2).
- [ ] `createReadLayerTransport(bundle)` returns the static-bundle transport when a bundle is present and falls back to the runtime transport otherwise (Task 10 test green).
- [ ] `docs/setup.md`, `docs/architecture.md`, `docs/data-model.md` exist and are guarded by keyword tests (Tasks 11–12 green).
- [ ] `CLAUDE.md` no longer says "not yet implemented", describes the two-store Neo4j + SQLite model, and links the three docs (Task 13 test green).
- [ ] `pnpm vitest run packages/exporter packages/desktop-api apps/public-viewer tests/docs` passes, `pnpm exec tsc -b` is clean, and (when WS2 has landed) `cargo test ... -- --test-threads=1` is green (Task 14).
