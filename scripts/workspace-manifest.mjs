#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

const [command, ...rawArguments] = process.argv.slice(2);

try {
  switch (command) {
    case "create":
      createManifest(parseFlags(rawArguments));
      break;
    case "checksums":
      createChecksums(requiredPositional(rawArguments, 0, "snapshot root"));
      break;
    case "verify-checksums":
      verifyChecksums(requiredPositional(rawArguments, 0, "snapshot root"));
      break;
    case "verify-data":
      verifyData(parseFlags(rawArguments));
      break;
    case "get":
      getManifestValue(
        requiredPositional(rawArguments, 0, "manifest path"),
        requiredPositional(rawArguments, 1, "field path"),
      );
      break;
    default:
      throw new Error(
        "usage: workspace-manifest.mjs <create|checksums|verify-checksums|verify-data|get>",
      );
  }
} catch (error) {
  process.stderr.write(`workspace-manifest: ${error.message}\n`);
  process.exitCode = 1;
}

function createManifest(flags) {
  const output = requiredFlag(flags, "output");
  const sqliteSummary = readJson(requiredFlag(flags, "sqlite-summary"));
  const roots = readJson(requiredFlag(flags, "roots"));
  const repositoryRoot = resolve(requiredFlag(flags, "repository-root"));
  const vaultFilesPath = flags.get("vault-files");
  const vaultFiles = vaultFilesPath
    ? readFileSync(vaultFilesPath, "utf8")
        .split("\n")
        .filter(Boolean)
        .sort()
    : [];

  const outsideRoots = roots.filter((root) => {
    const candidate = resolve(root);
    return candidate !== repositoryRoot && !candidate.startsWith(`${repositoryRoot}${sep}`);
  });
  if (outsideRoots.length > 0) {
    throw new Error(
      `workspace references vault roots outside the repository; attach or copy them into the repository before backup: ${outsideRoots.join(", ")}`,
    );
  }
  if (sqliteSummary.integrity !== "ok") {
    throw new Error(`SQLite integrity is ${JSON.stringify(sqliteSummary.integrity)}, expected "ok"`);
  }

  const packageJson = readJson(join(repositoryRoot, "package.json"));
  const manifest = {
    format: "research-canvas-workspace",
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    application: {
      name: packageJson.name,
      version: packageJson.version,
    },
    repository: {
      sourceRoot: repositoryRoot,
    },
    neo4j: {
      image: requiredFlag(flags, "neo4j-image"),
      imageId: requiredFlag(flags, "neo4j-image-id"),
      version: requiredFlag(flags, "neo4j-version"),
      database: requiredFlag(flags, "neo4j-database"),
      nodeCount: parseCount(requiredFlag(flags, "neo4j-nodes"), "Neo4j node"),
      relationshipCount: parseCount(
        requiredFlag(flags, "neo4j-relationships"),
        "Neo4j relationship",
      ),
    },
    sqlite: {
      file: "sqlite/research-canvas-authoring.sqlite",
      integrity: sqliteSummary.integrity,
      counts: sqliteSummary.counts,
    },
    vault: {
      files: vaultFiles,
    },
  };
  writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
}

function createChecksums(rootInput) {
  const root = resolve(rootInput);
  const files = listFiles(root).filter((path) => path !== "checksums.sha256");
  const lines = files.map((path) => `${sha256(join(root, path))}  ${path}`);
  writeFileSync(join(root, "checksums.sha256"), `${lines.join("\n")}\n`);
}

function verifyChecksums(rootInput) {
  const root = resolve(rootInput);
  const checksumPath = join(root, "checksums.sha256");
  if (!existsSync(checksumPath)) {
    throw new Error("snapshot is missing checksums.sha256");
  }
  const expected = new Map();
  for (const line of readFileSync(checksumPath, "utf8").split("\n").filter(Boolean)) {
    const match = line.match(/^([a-f0-9]{64})  (.+)$/);
    if (!match) {
      throw new Error(`invalid checksum line: ${line}`);
    }
    const path = normalizeSnapshotPath(match[2]);
    if (expected.has(path)) {
      throw new Error(`duplicate checksum path: ${path}`);
    }
    expected.set(path, match[1]);
  }
  const actualFiles = listFiles(root).filter((path) => path !== "checksums.sha256");
  assertEqualArrays([...expected.keys()].sort(), actualFiles, "snapshot file list");
  for (const [path, expectedHash] of expected) {
    const actualHash = sha256(join(root, path));
    if (actualHash !== expectedHash) {
      throw new Error(`checksum mismatch for ${path}: expected ${expectedHash}, got ${actualHash}`);
    }
  }
  process.stdout.write(`validated ${expected.size} snapshot files\n`);
}

function verifyData(flags) {
  const manifest = readJson(requiredFlag(flags, "manifest"));
  const sqliteSummary = readJson(requiredFlag(flags, "sqlite-summary"));
  assertManifestShape(manifest);
  if (sqliteSummary.integrity !== manifest.sqlite.integrity) {
    throw new Error(
      `SQLite integrity mismatch: expected ${manifest.sqlite.integrity}, got ${sqliteSummary.integrity}`,
    );
  }
  if (JSON.stringify(sqliteSummary.counts) !== JSON.stringify(manifest.sqlite.counts)) {
    throw new Error(
      `SQLite record counts differ from manifest\nexpected ${JSON.stringify(manifest.sqlite.counts)}\nactual ${JSON.stringify(sqliteSummary.counts)}`,
    );
  }
  const nodes = parseCount(requiredFlag(flags, "neo4j-nodes"), "Neo4j node");
  const relationships = parseCount(
    requiredFlag(flags, "neo4j-relationships"),
    "Neo4j relationship",
  );
  if (nodes !== manifest.neo4j.nodeCount) {
    throw new Error(`Neo4j node count mismatch: expected ${manifest.neo4j.nodeCount}, got ${nodes}`);
  }
  if (relationships !== manifest.neo4j.relationshipCount) {
    throw new Error(
      `Neo4j relationship count mismatch: expected ${manifest.neo4j.relationshipCount}, got ${relationships}`,
    );
  }
  process.stdout.write("SQLite and Neo4j counts match the snapshot manifest\n");
}

function getManifestValue(manifestPath, fieldPath) {
  const manifest = readJson(manifestPath);
  assertManifestShape(manifest);
  let value = manifest;
  for (const segment of fieldPath.split(".")) {
    value = value?.[segment];
  }
  if (value === undefined) {
    throw new Error(`manifest field does not exist: ${fieldPath}`);
  }
  process.stdout.write(
    typeof value === "object" ? `${JSON.stringify(value)}\n` : `${String(value)}\n`,
  );
}

function assertManifestShape(manifest) {
  if (manifest.format !== "research-canvas-workspace" || manifest.formatVersion !== 1) {
    throw new Error("unsupported workspace snapshot format");
  }
  if (
    !manifest.neo4j ||
    !manifest.sqlite ||
    typeof manifest.neo4j.image !== "string" ||
    typeof manifest.neo4j.imageId !== "string" ||
    typeof manifest.neo4j.version !== "string" ||
    !Number.isSafeInteger(manifest.neo4j.nodeCount) ||
    !Number.isSafeInteger(manifest.neo4j.relationshipCount) ||
    typeof manifest.sqlite.counts !== "object"
  ) {
    throw new Error("snapshot manifest is incomplete");
  }
}

function listFiles(root) {
  const output = [];
  walk(root, output, root);
  return output.sort();
}

function walk(directory, output, root) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`snapshot must not contain symbolic links: ${absolute}`);
    }
    if (entry.isDirectory()) {
      walk(absolute, output, root);
    } else if (entry.isFile()) {
      output.push(normalizeSnapshotPath(relative(root, absolute)));
    } else {
      throw new Error(`unsupported snapshot entry: ${absolute}`);
    }
  }
}

function sha256(path) {
  if (!lstatSync(path).isFile()) {
    throw new Error(`checksum target is not a regular file: ${path}`);
  }
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function normalizeSnapshotPath(path) {
  const normalized = path.replaceAll("\\", "/");
  if (
    normalized.startsWith("/") ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../") ||
    normalized.includes("\0")
  ) {
    throw new Error(`unsafe snapshot path: ${path}`);
  }
  return normalized;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function parseFlags(arguments_) {
  const flags = new Map();
  for (let index = 0; index < arguments_.length; index += 2) {
    const flag = arguments_[index];
    const value = arguments_[index + 1];
    if (!flag?.startsWith("--") || value === undefined) {
      throw new Error(`expected --name value arguments, got: ${arguments_.join(" ")}`);
    }
    flags.set(flag.slice(2), value);
  }
  return flags;
}

function requiredFlag(flags, name) {
  const value = flags.get(name);
  if (!value) {
    throw new Error(`missing --${name}`);
  }
  return value;
}

function requiredPositional(arguments_, index, label) {
  const value = arguments_[index];
  if (!value) {
    throw new Error(`missing ${label}`);
  }
  return value;
}

function parseCount(value, label) {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`${label} count is invalid: ${value}`);
  }
  return count;
}

function assertEqualArrays(expected, actual, label) {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error(
      `${label} differs from checksums\nexpected ${JSON.stringify(expected)}\nactual ${JSON.stringify(actual)}`,
    );
  }
}
