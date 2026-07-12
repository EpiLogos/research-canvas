import { execFile } from "node:child_process";

type JsonObject = Record<string, unknown>;

export type AgentEnvelope = {
  ok: boolean;
  command: string;
  warnings?: unknown[];
  data?: unknown;
  error?: string;
};

type AgentTool = {
  name: string;
  description: string;
  inputSchema: JsonObject;
  handler(input: JsonObject): Promise<AgentEnvelope>;
};

type AgentRunner = (executable: string, args: string[]) => Promise<string>;

type AgentToolOptions = {
  executable?: string;
  run?: AgentRunner;
};

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const AGENT_STDOUT_MAX_BUFFER_BYTES = 16 * 1024 * 1024;

export class AgentProcessError extends Error {
  constructor(
    message: string,
    readonly stdout: string,
    readonly stderr: string,
  ) {
    super(message);
    this.name = "AgentProcessError";
  }
}

const defaultRunner: AgentRunner = (executable, args) =>
  new Promise((resolve, reject) => {
    execFile(
      executable,
      args,
      { encoding: "utf8", maxBuffer: AGENT_STDOUT_MAX_BUFFER_BYTES },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new AgentProcessError(
              stderr.trim() ||
                stdout.trim() ||
                `${executable} exited with ${error.code ?? "an error"}`,
              stdout,
              stderr,
            ),
          );
          return;
        }
        resolve(stdout);
      },
    );
  });

export function createAgentTools(options: AgentToolOptions = {}): AgentTool[] {
  const executable =
    options.executable ?? process.env.AGENT_RESEARCH_BIN ?? "agent_research";
  const run = options.run ?? defaultRunner;

  return [
    {
      name: "agent_search_context",
      description:
        "Search project vault/resource files through the provider-neutral agent_research CLI. Read-only.",
      inputSchema: projectQuerySchema(),
      async handler(input) {
        return runAgentTool("agent_search_context", input, executable, run);
      },
    },
    {
      name: "agent_context_pack",
      description:
        "Build a structured project context pack through the provider-neutral agent_research CLI. Read-only.",
      inputSchema: projectQuerySchema(),
      async handler(input) {
        return runAgentTool("agent_context_pack", input, executable, run);
      },
    },
    {
      name: "agent_wikilinks",
      description:
        "Read outbound wikilinks for a vault file through the agent_research CLI. Read-only.",
      inputSchema: {
        type: "object",
        properties: {
          root: { type: "string" },
          file: { type: "string" },
        },
        required: ["root", "file"],
      },
      async handler(input) {
        return runAgentTool("agent_wikilinks", input, executable, run);
      },
    },
    {
      name: "agent_backlinks",
      description:
        "Find vault backlinks to a wiki target or path through the agent_research CLI. Read-only.",
      inputSchema: {
        type: "object",
        properties: {
          root: { type: "string" },
          target: { type: "string" },
        },
        required: ["root", "target"],
      },
      async handler(input) {
        return runAgentTool("agent_backlinks", input, executable, run);
      },
    },
  ];
}

export const agentTools = createAgentTools();

async function runAgentTool(
  toolName: string,
  input: JsonObject,
  executable: string,
  run: AgentRunner,
): Promise<AgentEnvelope> {
  const args = buildAgentCliArgs(toolName, input);
  try {
    return parseAgentEnvelope(await run(executable, args));
  } catch (error) {
    if (error instanceof AgentProcessError && error.stdout.trim().length > 0) {
      return parseAgentEnvelope(error.stdout);
    }
    throw error;
  }
}

export function buildAgentCliArgs(toolName: string, input: JsonObject): string[] {
  switch (toolName) {
    case "agent_search_context":
      return projectCommandArgs("search", input);
    case "agent_context_pack":
      return projectCommandArgs("context", input);
    case "agent_wikilinks":
      return [
        "wikilinks",
        "--root",
        requiredString(input, "root"),
        "--file",
        requiredString(input, "file"),
        "--json",
      ];
    case "agent_backlinks":
      return [
        "backlinks",
        "--root",
        requiredString(input, "root"),
        "--target",
        requiredString(input, "target"),
        "--json",
      ];
    default:
      throw new Error(`Unknown agent MCP tool: ${toolName}`);
  }
}

export function parseAgentEnvelope(stdout: string): AgentEnvelope {
  let envelope: AgentEnvelope;
  try {
    envelope = JSON.parse(stdout) as AgentEnvelope;
  } catch (error) {
    throw new Error(
      `agent_research returned invalid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!envelope.ok) {
    throw new Error(
      `agent_research ${envelope.command} failed: ${
        envelope.error ?? "unknown error"
      }`,
    );
  }

  return envelope;
}

function projectCommandArgs(command: "search" | "context", input: JsonObject) {
  return [
    command,
    "--database",
    requiredString(input, "database"),
    "--project",
    requiredString(input, "project"),
    "--query",
    requiredString(input, "query"),
    "--limit",
    String(optionalLimit(input)),
    "--json",
  ];
}

function projectQuerySchema(): JsonObject {
  return {
    type: "object",
    properties: {
      database: { type: "string" },
      project: { type: "string" },
      query: { type: "string" },
      limit: { type: "number" },
    },
    required: ["database", "project", "query"],
  };
}

function requiredString(input: JsonObject, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required string: ${key}`);
  }
  return value;
}

function optionalLimit(input: JsonObject): number {
  const value = input.limit;
  if (value === undefined) {
    return DEFAULT_LIMIT;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) {
    throw new Error("limit must be a positive number");
  }
  return Math.min(Math.trunc(value), MAX_LIMIT);
}
