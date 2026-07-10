import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

for (const declarationDirectory of [
  "packages/schema/dist",
  "packages/desktop-api/dist",
  "packages/exporter/dist",
  "packages/canvas/dist"
]) {
  rmSync(path.join(repositoryRoot, declarationDirectory), {
    force: true,
    recursive: true
  });
}

for (const buildInfoFile of [
  "packages/schema/tsconfig.tsbuildinfo",
  "packages/desktop-api/tsconfig.tsbuildinfo",
  "packages/exporter/tsconfig.tsbuildinfo",
  "packages/canvas/tsconfig.tsbuildinfo"
]) {
  rmSync(path.join(repositoryRoot, buildInfoFile), { force: true });
}

run("pnpm", ["exec", "tsc", "--build", "packages/exporter/tsconfig.json"]);
run("pnpm", ["--filter", "@research-canvas/canvas", "build"]);

function run(command, arguments_) {
  const result = spawnSync(command, arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: "pipe"
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
