#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, dirname, relative, sep } from "node:path";

const IMAGE_EXTENSIONS = new Set([".avif", ".gif", ".jpeg", ".jpg", ".png", ".svg", ".tif", ".tiff", ".webp"]);
const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown", ".mdown", ".mkd"]);
const IMAGE_REFERENCE = /!\[[^\]]*\]\(([^)]+)\)/g;

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const summaryOnly = args.includes("--summary");
const rootArgument = args.find((arg) => !arg.startsWith("-")) ?? "antichrist-vault";
const vaultRoot = resolve(rootArgument);

if (!existsSync(vaultRoot) || !statSync(vaultRoot).isDirectory()) {
  process.stderr.write(`Vault directory not found: ${vaultRoot}\n`);
  process.exit(2);
}

const files = walk(vaultRoot);
const localAssets = files.filter((path) => IMAGE_EXTENSIONS.has(extension(path)));
const markdownFiles = files.filter((path) => MARKDOWN_EXTENSIONS.has(extension(path)));
const localReferences = [];
const remoteReferences = [];
const blobReferences = [];
const unsupportedReferences = [];

for (const markdownPath of markdownFiles) {
  const content = readFileSync(markdownPath, "utf8");
  for (const reference of content.matchAll(IMAGE_REFERENCE)) {
    const rawReference = reference[1]?.trim() ?? "";
    if (!rawReference) continue;
    const source = relative(vaultRoot, markdownPath).split(sep).join("/");
    if (rawReference.startsWith("blob:")) {
      blobReferences.push({ source, reference: rawReference });
      continue;
    }
    if (/^https?:\/\//i.test(rawReference)) {
      remoteReferences.push({ source, reference: rawReference });
      continue;
    }
    if (/^[a-z][a-z\d+.-]*:/i.test(rawReference)) {
      unsupportedReferences.push({ source, reference: rawReference, reason: "unsupported_scheme" });
      continue;
    }

    const resolvedPath = resolveLocalReference(vaultRoot, markdownPath, rawReference);
    const insideVault = isWithin(vaultRoot, resolvedPath);
    const exists = insideVault && existsSync(resolvedPath);
    localReferences.push({
      source,
      reference: rawReference,
      resolved: insideVault ? relative(vaultRoot, resolvedPath).split(sep).join("/") : null,
      exists,
      reason: insideVault ? (exists ? null : "missing_file") : "escapes_vault",
    });
  }
}

const unresolved = [
  ...blobReferences,
  ...unsupportedReferences,
  ...localReferences.filter((reference) => !reference.exists),
];
const report = {
  vaultRoot,
  summary: {
    markdownFiles: markdownFiles.length,
    localImageAssets: localAssets.length,
    localImageReferences: localReferences.length,
    remoteImageReferences: remoteReferences.length,
    ephemeralBlobReferences: blobReferences.length,
    unresolvedImageReferences: unresolved.length,
  },
  localAssets: localAssets.map((path) => relative(vaultRoot, path).split(sep).join("/")),
  localReferences,
  remoteReferences,
  blobReferences,
  unsupportedReferences,
};

const output = summaryOnly
  ? { vaultRoot, summary: report.summary, unresolvedReferences: unresolved }
  : report;
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
if (strict && unresolved.length > 0) process.exitCode = 1;

function walk(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) files.push(...walk(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function extension(path) {
  const index = path.lastIndexOf(".");
  return index < 0 ? "" : path.slice(index).toLowerCase();
}

function resolveLocalReference(root, markdownPath, reference) {
  if (reference.startsWith("assets/")) return resolve(root, reference);
  return resolve(dirname(markdownPath), reference);
}

function isWithin(root, path) {
  const relation = relative(root, path);
  return relation === "" || (!relation.startsWith(`..${sep}`) && relation !== ".." && !relation.startsWith(".."));
}
