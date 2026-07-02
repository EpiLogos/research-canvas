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
