// @vitest-environment node

import { once } from "node:events";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

import { afterEach, expect, test } from "vitest";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptsDir, "../../..");
const nodeModulesBin = resolve(workspaceRoot, "node_modules/.bin");

interface SpawnedProcess {
  child: ChildProcessWithoutNullStreams;
  output: { stderr: string; stdout: string };
}

const spawnedProcesses: SpawnedProcess[] = [];

afterEach(async () => {
  while (spawnedProcesses.length > 0) {
    const processHandle = spawnedProcesses.pop();
    if (!processHandle) {
      continue;
    }

    await stopProcess(processHandle.child);
  }
});

test(
  "dev launcher reuses an existing terminal bridge on the configured port",
  async () => {
  const bridgePort = await allocatePort();
  const vitePort = await allocatePort();

  const bridge = spawnProcess(["scripts/terminal-bridge.mjs"], {
    RESEARCH_CANVAS_TERMINAL_BRIDGE_PORT: String(bridgePort)
  });
  spawnedProcesses.push(bridge);

  await waitForTerminalBridge(`http://127.0.0.1:${bridgePort}`);

  const dev = spawnProcess(
    ["scripts/dev.mjs", "--host", "127.0.0.1", "--port", String(vitePort)],
    {
      RESEARCH_CANVAS_TERMINAL_BRIDGE_PORT: String(bridgePort),
      VITE_RESEARCH_CANVAS_TERMINAL_BRIDGE_PORT: String(bridgePort)
    }
  );
  spawnedProcesses.push(dev);

  await waitForOutput(
    dev,
    `[dev] Reusing terminal bridge on http://127.0.0.1:${bridgePort}/`
  );
  await waitForHttpOk(`http://127.0.0.1:${vitePort}`);

  await stopProcess(dev.child);
  spawnedProcesses.pop();

  await waitForTerminalBridge(`http://127.0.0.1:${bridgePort}`);
  },
  30_000
);

function spawnProcess(
  args: string[],
  env: Record<string, string>
): SpawnedProcess {
  const output = { stderr: "", stdout: "" };
  const child = spawn(process.execPath, args, {
    cwd: resolve(workspaceRoot, "apps/desktop"),
    env: {
      ...process.env,
      ...env,
      PATH: `${nodeModulesBin}:${process.env.PATH ?? ""}`
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    output.stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    output.stderr += chunk;
  });

  return { child, output };
}

async function waitForOutput(
  processHandle: SpawnedProcess,
  text: string,
  timeoutMs = 20_000
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const combinedOutput =
      processHandle.output.stdout + processHandle.output.stderr;
    if (combinedOutput.includes(text)) {
      return;
    }

    if (processHandle.child.exitCode !== null) {
      throw new Error(
        `Process exited before emitting ${JSON.stringify(text)}.\n${combinedOutput}`
      );
    }

    await delay(100);
  }

  throw new Error(
    `Timed out waiting for ${JSON.stringify(text)}.\n${processHandle.output.stdout}${processHandle.output.stderr}`
  );
}

async function waitForHttpOk(url: string, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Process may still be starting.
    }

    await delay(100);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForTerminalBridge(baseUrl: string, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const createResponse = await fetch(`${baseUrl}/terminal/session`, {
        body: JSON.stringify({ workdir: resolve(workspaceRoot, "apps/desktop") }),
        headers: { "Content-Type": "application/json" },
        method: "POST"
      });
      if (!createResponse.ok) {
        await delay(100);
        continue;
      }

      const session = (await createResponse.json()) as { id?: string };
      if (!session.id) {
        await delay(100);
        continue;
      }

      const closeResponse = await fetch(
        `${baseUrl}/terminal/session/${session.id}/close`,
        {
          body: JSON.stringify({}),
          headers: { "Content-Type": "application/json" },
          method: "DELETE"
        }
      );
      if (closeResponse.ok) {
        return;
      }
    } catch {
      // Process may still be starting.
    }

    await delay(100);
  }

  throw new Error(`Timed out waiting for terminal bridge at ${baseUrl}`);
}

async function stopProcess(child: ChildProcessWithoutNullStreams) {
  if (child.exitCode !== null) {
    return;
  }

  child.kill("SIGTERM");
  const exited = once(child, "exit");
  const timeout = delay(5_000).then(() => {
    if (child.exitCode === null) {
      child.kill("SIGKILL");
    }
  });

  await Promise.race([exited, timeout]);
  if (child.exitCode === null) {
    await exited;
  }
}

function allocatePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Unable to allocate a TCP port")));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolvePort(port);
      });
    });
  });
}
