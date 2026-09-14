// Frontend data-layer boundary (refinement-2, ticket #26): the frontend talks
// to the two-store data layer exclusively through the WorkspaceTransport seam
// in packages/desktop-api. These tests scan the production frontend source
// tree and lock two invariants:
//   1. no frontend file embeds raw SQL or opens a SQLite connection;
//   2. every Tauri `invoke` call lives inside packages/desktop-api, except the
//      two allowlisted OS-chrome / terminal seams.
//
// The tests are filesystem scans, not behaviour tests: a regression here is a
// file in the wrong layer, and it fails loudly.

import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

function findRepoRoot(start: string = process.cwd()): string {
  let dir = start;
  for (;;) {
    if (
      existsSync(join(dir, "vitest.config.ts")) ||
      existsSync(join(dir, "pnpm-workspace.yaml"))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`repo root not found from ${start}`);
    }
    dir = parent;
  }
}

const REPO_ROOT = findRepoRoot();

// Tauri OS-chrome / terminal seams that legitimately invoke Tauri outside the
// desktop-api transport boundary. Everything else must go through the
// WorkspaceTransport.
const ALLOWLISTED_INVOKE_FILES = new Set([
  "apps/desktop/src/features/canvas/CanvasWorkspaceContext.tsx",
  "apps/desktop/src/features/terminal/terminalTransport.ts",
]);

// This boundary test lives in the transport package and must not scan itself.
const SELF = "dataLayerBoundary.test.ts";

function collectFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === "coverage") {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
}

function frontendFiles(): string[] {
  const files: string[] = [];
  for (const root of ["apps/desktop/src", "packages"]) {
    const abs = join(REPO_ROOT, root);
    if (existsSync(abs) && statSync(abs).isDirectory()) {
      collectFiles(abs, files);
    }
  }
  return files.filter((f) => !f.endsWith(SELF) && !f.includes("/dist/"));
}

// Built from split tokens so the patterns' own source text (the test file is
// excluded above, but the strings are still avoided for clarity). Patterns are
// case-sensitive: real SQL in this codebase is uppercase, while frontend prose
// such as "Select a project from" is not a statement.
const SQL_PATTERNS: RegExp[] = [
  new RegExp(`\\bCREATE\\s+TABLE\\b`),
  new RegExp(`\\bINSERT\\s+INTO\\b`),
  new RegExp(`\\bDELETE\\s+FROM\\b`),
  new RegExp(`\\bALTER\\s+TABLE\\b`),
  new RegExp(`\\bDROP\\s+TABLE\\b`),
  new RegExp(`\\bUPDATE\\s+[A-Za-z_][A-Za-z0-9_]*\\s+SET\\b`),
  new RegExp(`\\bSELECT\\s+(?:\\*|DISTINCT|COUNT\\()|\\bSELECT\\b[^;\\n]*\\bFROM\\b`),
  /@tauri-apps\/plugin-sql/,
  /better-sqlite/,
];

const INVOKE_PATTERN = /invoke(?:Tauri(?:<[^>]*>)?)?\(/;

describe("frontend data-layer boundary", () => {
  it("never embeds raw SQL or a SQLite connection in frontend code", () => {
    const offenders: string[] = [];
    for (const file of frontendFiles()) {
      const src = readFileSync(file, "utf8");
      for (const pattern of SQL_PATTERNS) {
        if (pattern.test(src)) {
          offenders.push(`${relative(REPO_ROOT, file)}: ${pattern}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("confines Tauri invoke calls to the desktop-api transport boundary", () => {
    const offenders: string[] = [];
    for (const file of frontendFiles()) {
      const rel = relative(REPO_ROOT, file);
      if (rel.startsWith("packages/desktop-api")) {
        continue;
      }
      if (ALLOWLISTED_INVOKE_FILES.has(rel)) {
        continue;
      }
      const src = readFileSync(file, "utf8");
      if (INVOKE_PATTERN.test(src)) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no file outside desktop-api imports the Tauri IPC invoke function", () => {
    const offenders: string[] = [];
    for (const file of frontendFiles()) {
      const rel = relative(REPO_ROOT, file);
      if (rel.startsWith("packages/desktop-api")) {
        continue;
      }
      if (ALLOWLISTED_INVOKE_FILES.has(rel)) {
        continue;
      }
      const src = readFileSync(file, "utf8");
      const importsInvoke = /import\s*\{[^}]*\binvoke\b[^}]*\}\s*from\s*["']@tauri-apps\/api\/core["']/.test(
        src,
      );
      if (importsInvoke) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
