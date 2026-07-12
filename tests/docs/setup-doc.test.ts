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
      "17687"
    ]) {
      expect(content).toContain(token);
    }
  });
});
