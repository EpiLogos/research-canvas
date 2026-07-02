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
