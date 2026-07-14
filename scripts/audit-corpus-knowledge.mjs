#!/usr/bin/env node

import { fileURLToPath } from "node:url";

import { compileCorpusKnowledge } from "./compile-corpus-knowledge.mjs";

function normaliseTarget(value) {
  return value.trim().replace(/\\/g, "/").replace(/\.md$/i, "").toLowerCase();
}

function aliasesForSource(sourcePath) {
  const withoutExtension = normaliseTarget(sourcePath);
  const basename = withoutExtension.slice(withoutExtension.lastIndexOf("/") + 1);
  return [withoutExtension, basename];
}

function bodyIsShallow(body) {
  try {
    const blocks = JSON.parse(body);
    return !Array.isArray(blocks) || blocks.length < 2;
  } catch {
    return true;
  }
}

/**
 * Reports graph-link health rather than guessing a target for ambiguous links.
 * Consumers can choose whether unresolved links are warnings or a strict gate.
 */
export function auditCorpusKnowledge(compiled) {
  const targets = new Map();
  const addTarget = (alias, target) => {
    const key = normaliseTarget(alias);
    if (!key) return;
    const current = targets.get(key) ?? [];
    if (!current.includes(target)) current.push(target);
    targets.set(key, current);
  };
  for (const document of compiled.documents ?? []) {
    addTarget(document.slug, `document:${document.slug}`);
  }
  for (const source of compiled.sources ?? []) {
    for (const alias of aliasesForSource(source.path)) {
      addTarget(alias, `source:${source.path}`);
    }
  }
  for (const [alias, target] of Object.entries(compiled.linkTargets ?? {})) {
    // Manifest targets are explicit curator decisions. They intentionally
    // shadow a same-named source basename rather than leaving the reader to
    // guess whether a prose wikilink means a graph entity or a file.
    targets.set(normaliseTarget(alias), [target]);
  }

  const unresolvedWikilinks = [];
  const ambiguousWikilinks = [];
  let resolvedWikilinkCount = 0;
  const shallowDocuments = [];
  for (const document of compiled.documents ?? []) {
    if (bodyIsShallow(document.body)) shallowDocuments.push(document.slug);
    for (const rawTarget of document.wikilinks ?? []) {
      const target = rawTarget.split("#", 1)[0];
      const candidates = targets.get(normaliseTarget(target)) ?? [];
      if (candidates.length === 1) {
        resolvedWikilinkCount += 1;
      } else if (candidates.length === 0) {
        unresolvedWikilinks.push({ sourceSlug: document.slug, target: rawTarget });
      } else {
        ambiguousWikilinks.push({ sourceSlug: document.slug, target: rawTarget, candidates });
      }
    }
  }
  return {
    documentCount: (compiled.documents ?? []).length,
    sourceCount: (compiled.sources ?? []).length,
    resolvedWikilinkCount,
    unresolvedWikilinks: unresolvedWikilinks.sort(compareLinks),
    ambiguousWikilinks: ambiguousWikilinks.sort(compareLinks),
    shallowDocuments: shallowDocuments.sort(),
  };
}

function compareLinks(left, right) {
  return left.sourceSlug.localeCompare(right.sourceSlug) || left.target.localeCompare(right.target);
}

async function main() {
  const strict = process.argv.slice(2).includes("--strict");
  const compiled = await compileCorpusKnowledge();
  const report = auditCorpusKnowledge(compiled);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (
    strict &&
    (report.unresolvedWikilinks.length > 0 ||
      report.ambiguousWikilinks.length > 0 ||
      report.shallowDocuments.length > 0)
  ) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
