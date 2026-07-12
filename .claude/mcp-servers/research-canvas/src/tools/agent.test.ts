import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildAgentCliArgs,
  createAgentTools,
  parseAgentEnvelope,
} from "./agent.js";

describe("agent research MCP adapter", () => {
  it("exposes only read and context tools", () => {
    const tools = createAgentTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "agent_backlinks",
      "agent_context_pack",
      "agent_search_context",
      "agent_wikilinks",
    ]);
    expect(tools.map((tool) => tool.name).join(" ")).not.toContain("tag");
    expect(tools.map((tool) => tool.name).join(" ")).not.toContain("attach");
  });

  it("builds deterministic CLI arguments with json mode", () => {
    expect(
      buildAgentCliArgs("agent_search_context", {
        database: "/tmp/research.sqlite",
        project: "project-1",
        query: "mithraic bull",
        limit: 8,
      }),
    ).toEqual([
      "search",
      "--database",
      "/tmp/research.sqlite",
      "--project",
      "project-1",
      "--query",
      "mithraic bull",
      "--limit",
      "8",
      "--json",
    ]);

    expect(
      buildAgentCliArgs("agent_wikilinks", {
        root: "/vault",
        file: "/vault/mithras.md",
      }),
    ).toEqual([
      "wikilinks",
      "--root",
      "/vault",
      "--file",
      "/vault/mithras.md",
      "--json",
    ]);
  });

  it("shells out to the local CLI executable and returns the parsed envelope", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-research-mcp-"));
    const script = join(dir, "agent_research");
    const argsPath = join(dir, "args.json");
    writeFileSync(
      script,
      `#!/usr/bin/env node
const fs = require("node:fs");
fs.writeFileSync(${JSON.stringify(argsPath)}, JSON.stringify(process.argv.slice(2)));
process.stdout.write(JSON.stringify({
  ok: true,
  command: "context",
  warnings: [],
  data: { query: "mithras", files: [] }
}));
`,
    );
    chmodSync(script, 0o755);
    const tools = createAgentTools({ executable: script });
    const contextTool = tools.find((tool) => tool.name === "agent_context_pack");

    const result = await contextTool?.handler({
      database: "/tmp/research.sqlite",
      project: "project-1",
      query: "mithras",
      limit: 3,
    });

    expect(JSON.parse(readFileSync(argsPath, "utf8"))).toEqual([
      "context",
      "--database",
      "/tmp/research.sqlite",
      "--project",
      "project-1",
      "--query",
      "mithras",
      "--limit",
      "3",
      "--json",
    ]);
    expect(result).toEqual({
      ok: true,
      command: "context",
      warnings: [],
      data: { query: "mithras", files: [] },
    });
  });

  it("surfaces CLI error envelopes as MCP handler errors", () => {
    expect(() =>
      parseAgentEnvelope(
        JSON.stringify({
          ok: false,
          command: "context",
          error: "database not found",
          warnings: [],
        }),
      ),
    ).toThrow("agent_research context failed: database not found");
  });

  it("surfaces structured CLI failure envelopes from non-zero process exits", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-research-mcp-"));
    const script = join(dir, "agent_research_error");
    writeFileSync(
      script,
      `#!/usr/bin/env node
process.stdout.write(JSON.stringify({
  ok: false,
  command: "context",
  error: "database not found",
  warnings: []
}));
process.exit(1);
`,
    );
    chmodSync(script, 0o755);
    const tools = createAgentTools({ executable: script });
    const contextTool = tools.find((tool) => tool.name === "agent_context_pack");

    await expect(
      contextTool?.handler({
        database: "/tmp/missing.sqlite",
        project: "project-1",
        query: "mithras",
      }),
    ).rejects.toThrow("agent_research context failed: database not found");
  });

  it("reads large but valid CLI envelopes without hitting Node's default stdout buffer", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-research-mcp-"));
    const script = join(dir, "agent_research_large");
    const largeSnippet = "x".repeat(1_200_000);
    writeFileSync(
      script,
      `#!/usr/bin/env node
process.stdout.write(JSON.stringify({
  ok: true,
  command: "context",
  warnings: [],
  data: { query: "mithras", files: [{ title: "large.md", snippet: ${JSON.stringify(largeSnippet)} }] }
}));
`,
    );
    chmodSync(script, 0o755);
    const tools = createAgentTools({ executable: script });
    const contextTool = tools.find((tool) => tool.name === "agent_context_pack");

    const result = await contextTool?.handler({
      database: "/tmp/research.sqlite",
      project: "project-1",
      query: "mithras",
      limit: 25,
    });

    expect((result?.data as { files: Array<{ snippet: string }> }).files[0]?.snippet).toHaveLength(
      largeSnippet.length,
    );
  });

  it("caps caller-provided context limits before invoking the CLI", () => {
    expect(
      buildAgentCliArgs("agent_context_pack", {
        database: "/tmp/research.sqlite",
        project: "project-1",
        query: "mithras",
        limit: 10_000,
      }),
    ).toContain("50");
  });
});
