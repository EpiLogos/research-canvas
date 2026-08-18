import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const viteArgs = process.argv.slice(2);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const terminalBridgeManifest = join(
  scriptDirectory,
  "..",
  "src-tauri",
  "Cargo.toml"
);
const TERMINAL_BRIDGE_HOST = "127.0.0.1";
const DEFAULT_TERMINAL_BRIDGE_PORT = 4789;
const TERMINAL_BRIDGE_PORT = resolveTerminalBridgePort(process.env);
const TERMINAL_BRIDGE_BASE_URL = `http://${TERMINAL_BRIDGE_HOST}:${TERMINAL_BRIDGE_PORT}/`;
const sharedEnv = {
  ...loadDotEnv(process.cwd()),
  ...process.env,
  RESEARCH_CANVAS_TERMINAL_BRIDGE_PORT: String(TERMINAL_BRIDGE_PORT),
  VITE_RESEARCH_CANVAS_TERMINAL_BRIDGE_PORT:
    process.env.VITE_RESEARCH_CANVAS_TERMINAL_BRIDGE_PORT ??
    String(TERMINAL_BRIDGE_PORT)
};

const bridge = (await hasRunningTerminalBridge(TERMINAL_BRIDGE_BASE_URL))
  ? null
  : spawn(
      "cargo",
      [
        "run",
        "--manifest-path",
        terminalBridgeManifest,
        "--bin",
        "terminal_bridge"
      ],
      {
        cwd: process.cwd(),
        env: sharedEnv,
        stdio: "inherit"
      }
    );

if (bridge === null) {
  console.log(`[dev] Reusing terminal bridge on ${TERMINAL_BRIDGE_BASE_URL}`);
}

const vite = spawn("vite", viteArgs, {
  cwd: process.cwd(),
  env: sharedEnv,
  stdio: "inherit"
});

const children = bridge === null ? [vite] : [bridge, vite];

function shutdown(signal) {
  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(signal));
}

process.on("exit", () => shutdown("SIGTERM"));

if (bridge !== null) {
  bridge.on("exit", (code) => {
    if (code && code !== 0) {
      vite.kill("SIGTERM");
      process.exitCode = code;
    }
  });
}

vite.on("exit", (code) => {
  if (code && code !== 0) {
    bridge?.kill("SIGTERM");
    process.exitCode = code;
  }
});

function resolveTerminalBridgePort(env) {
  const rawPort = env.RESEARCH_CANVAS_TERMINAL_BRIDGE_PORT;
  if (rawPort === undefined) {
    return DEFAULT_TERMINAL_BRIDGE_PORT;
  }

  const port = Number.parseInt(rawPort, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      `Invalid RESEARCH_CANVAS_TERMINAL_BRIDGE_PORT value: ${rawPort}`
    );
  }

  return port;
}

function loadDotEnv(startDir) {
  const file = findUp(startDir, ".env");
  if (!file) {
    return {};
  }

  const env = {};
  for (const rawLine of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const equalsAt = line.indexOf("=");
    if (equalsAt === -1) {
      continue;
    }
    const key = line.slice(0, equalsAt).trim();
    const value = line.slice(equalsAt + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key) {
      env[key] = value;
    }
  }
  return env;
}

function findUp(startDir, fileName) {
  let current = startDir;
  while (true) {
    const candidate = join(current, fileName);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

async function hasRunningTerminalBridge(baseUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 750);

  try {
    const createResponse = await fetch(`${baseUrl}terminal/session`, {
      body: JSON.stringify({ workdir: process.cwd() }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal: controller.signal
    });
    if (!createResponse.ok) {
      return false;
    }

    const session = await createResponse.json();
    if (!session?.id) {
      return false;
    }

    const closeResponse = await fetch(
      `${baseUrl}terminal/session/${session.id}/close`,
      {
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
        method: "DELETE",
        signal: controller.signal
      }
    );

    return closeResponse.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}