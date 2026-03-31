import { spawn } from "node:child_process";

const viteArgs = process.argv.slice(2);
const TERMINAL_BRIDGE_HOST = "127.0.0.1";
const DEFAULT_TERMINAL_BRIDGE_PORT = 4789;
const TERMINAL_BRIDGE_PORT = resolveTerminalBridgePort(process.env);
const TERMINAL_BRIDGE_BASE_URL = `http://${TERMINAL_BRIDGE_HOST}:${TERMINAL_BRIDGE_PORT}/`;
const sharedEnv = {
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
        "/Users/admin/Documents/Antichrist Project/apps/desktop/src-tauri/Cargo.toml",
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
