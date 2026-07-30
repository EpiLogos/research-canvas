import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "..");
const command = join(repositoryRoot, "scripts", "research-canvas");

test("help exposes the stable partner command surface", () => {
  const output = execFileSync(command, ["help"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });

  for (const expected of [
    "research-canvas start",
    "research-canvas stop",
    "research-canvas backup",
    "research-canvas restore",
    "research-canvas verify",
  ]) {
    assert.match(output, new RegExp(expected));
  }
});

test("start creates only a missing env file and stops for password setup", () => {
  const isolatedRoot = mkdtempSync(join(tmpdir(), "research-canvas-command-"));
  const example = "NEO4J_PASSWORD=\nNEO4J_USER=neo4j\n";
  writeFileSync(join(isolatedRoot, ".env.example"), example);

  const first = spawnSync(command, ["start"], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      RESEARCH_CANVAS_REPO_ROOT: isolatedRoot,
    },
    encoding: "utf8",
  });

  assert.notEqual(first.status, 0);
  assert.match(first.stderr, /created .*\.env/i);
  assert.match(first.stderr, /set NEO4J_PASSWORD/i);
  assert.equal(readFileSync(join(isolatedRoot, ".env"), "utf8"), example);

  writeFileSync(join(isolatedRoot, ".env"), "NEO4J_PASSWORD=keep-me\n");
  const second = spawnSync(command, ["start"], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      RESEARCH_CANVAS_REPO_ROOT: isolatedRoot,
      PATH: "",
    },
    encoding: "utf8",
  });

  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /Docker is required/i);
  assert.equal(
    readFileSync(join(isolatedRoot, ".env"), "utf8"),
    "NEO4J_PASSWORD=keep-me\n",
    "start must not overwrite an existing env file",
  );
});

test("compose publishes Neo4j only on loopback", () => {
  const config = execFileSync(
    "docker",
    [
      "compose",
      "--env-file",
      ".env.example",
      "--file",
      "docker-compose.yml",
      "config",
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: { ...process.env, NEO4J_PASSWORD: "compose-contract-only" },
    },
  );

  assert.match(config, /host_ip: 127\.0\.0\.1/);
  assert.doesNotMatch(config, /host_ip: 0\.0\.0\.0/);
});

test("desktop dev launcher resolves the terminal bridge inside the active clone", () => {
  const launcher = readFileSync(
    join(repositoryRoot, "apps", "desktop", "scripts", "dev.mjs"),
    "utf8",
  );

  assert.doesNotMatch(
    launcher,
    /["']\/Users\/[^"']+\/apps\/desktop\/src-tauri\/Cargo\.toml["']/,
    "the launcher must not contain an author-machine Cargo manifest path",
  );
  assert.match(launcher, /fileURLToPath\(import\.meta\.url\)/);
  assert.match(
    launcher,
    /join\(\s*scriptDirectory,\s*"\.\.",\s*"src-tauri",\s*"Cargo\.toml"\s*\)/,
  );
});
