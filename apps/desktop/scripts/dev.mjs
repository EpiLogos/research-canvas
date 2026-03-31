import { spawn } from "node:child_process";

const viteArgs = process.argv.slice(2);

const bridge = spawn(
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
  env: process.env,
  stdio: "inherit"
  }
);

const vite = spawn("vite", viteArgs, {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit"
});

const children = [bridge, vite];

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

bridge.on("exit", (code) => {
  if (code && code !== 0) {
    vite.kill("SIGTERM");
    process.exitCode = code;
  }
});

vite.on("exit", (code) => {
  if (code && code !== 0) {
    bridge.kill("SIGTERM");
    process.exitCode = code;
  }
});
