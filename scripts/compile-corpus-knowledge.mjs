#!/usr/bin/env node

/**
 * Compiles selected vault prose into the portable BlockNote documents consumed
 * by the local graph seed. The manifest is deliberately declarative: source
 * coordinates remain relative to the repository and the compiler never reads
 * an arbitrary absolute path supplied by a workspace.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function portablePath(value) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Corpus source paths must be non-empty strings");
  }
  if (path.isAbsolute(value) || value.split(/[\\/]+/).some((segment) => segment === "..")) {
    throw new Error(`Corpus source path must be a relative path within the corpus root: ${value}`);
  }
  return value.replaceAll("\\", "/");
}

function headingAt(line) {
  const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
  return match ? { level: match[1].length, title: match[2] } : null;
}

function headingSlug(title) {
  return title
    .toLowerCase()
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target, alias) => alias ?? target)
    .replace(/[`*_]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function textInline(value) {
  return [{ type: "text", text: value, styles: {} }];
}

function markdownSelectionToBlocks(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === "") {
      index += 1;
      continue;
    }
    const heading = headingAt(line);
    if (heading) {
      blocks.push({
        type: "heading",
        props: { level: Math.min(heading.level, 3) },
        content: textInline(heading.title),
      });
      index += 1;
      continue;
    }
    const bullet = /^[-*+]\s+(.+)$/.exec(line);
    if (bullet) {
      blocks.push({ type: "bulletListItem", content: textInline(bullet[1].trim()) });
      index += 1;
      continue;
    }
    const numbered = /^\d+\.\s+(.+)$/.exec(line);
    if (numbered) {
      blocks.push({ type: "numberedListItem", content: textInline(numbered[1].trim()) });
      index += 1;
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      blocks.push({ type: "quote", content: textInline(quote[1].trim()) });
      index += 1;
      continue;
    }

    const paragraph = [];
    while (index < lines.length) {
      const candidate = lines[index];
      if (
        candidate.trim() === "" ||
        headingAt(candidate) ||
        /^[-*+]\s+/.test(candidate) ||
        /^\d+\.\s+/.test(candidate) ||
        /^>\s?/.test(candidate)
      ) {
        break;
      }
      paragraph.push(candidate.trim());
      index += 1;
    }
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", content: textInline(paragraph.join(" ")) });
    } else {
      index += 1;
    }
  }
  return blocks;
}

/** Extract portable wikilink targets without guessing an ambiguous filename. */
export function extractWikiLinks(markdown) {
  // Some vault exports escape the display separator (`\\|`) even though it is
  // still a normal Obsidian-style wikilink.  Normalize that representation
  // before parsing so a portable graph target never inherits a stray slash.
  const normalized = markdown.replaceAll("\\|", "|");
  return [
    ...new Set(
      [...normalized.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)]
        .map((match) => match[1].trim())
        .filter(Boolean),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

function extractSelection(source, document) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let start = 0;
  let selectedHeading = null;
  if (document.startHeading) {
    start = lines.findIndex((line) => headingAt(line)?.title === document.startHeading);
    if (start === -1) {
      throw new Error(`Could not find heading \`${document.startHeading}\` for ${document.slug}`);
    }
    selectedHeading = headingAt(lines[start]);
  } else if (document.startText) {
    start = lines.findIndex((line) => line.includes(document.startText));
    if (start === -1) {
      throw new Error(`Could not find source text for ${document.slug}`);
    }
  }
  let end = lines.length;
  for (let index = start + (selectedHeading ? 1 : 0); index < lines.length; index += 1) {
    const heading = headingAt(lines[index]);
    if (!heading) continue;
    if (document.endHeading && heading.title === document.endHeading) {
      end = index;
      break;
    }
    if (!document.endHeading && selectedHeading && heading.level <= selectedHeading.level) {
      end = index;
      break;
    }
  }
  const section = lines.slice(start, end).join("\n").trim();
  if (section.length === 0) {
    throw new Error(`Selection for ${document.slug} is empty`);
  }
  const anchor = document.anchor ?? (selectedHeading ? headingSlug(selectedHeading.title) : "document");
  return { section, anchor };
}

function validateManifest(manifest) {
  if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.sources) || !Array.isArray(manifest.documents)) {
    throw new Error("Corpus manifest must declare schemaVersion 1, sources, and documents");
  }
  if (!Number.isSafeInteger(manifest.contentRevision) || manifest.contentRevision < 1) {
    throw new Error("Corpus manifest must declare a positive integer contentRevision");
  }
  if (manifest.linkTargets !== undefined) {
    if (!manifest.linkTargets || Array.isArray(manifest.linkTargets) || typeof manifest.linkTargets !== "object") {
      throw new Error("Corpus manifest linkTargets must be an object when declared");
    }
    for (const [alias, target] of Object.entries(manifest.linkTargets)) {
      if (!normaliseLinkTarget(alias) || typeof target !== "string" || target.length === 0) {
        throw new Error("Corpus manifest linkTargets must map portable aliases to graph targets");
      }
    }
  }
  const sources = new Map();
  for (const source of manifest.sources) {
    const sourcePath = portablePath(source.path);
    if (typeof source.role !== "string" || source.role.length === 0) {
      throw new Error(`Corpus source ${sourcePath} must declare a role`);
    }
    if (sources.has(sourcePath)) {
      throw new Error(`Corpus manifest repeats source path ${sourcePath}`);
    }
    sources.set(sourcePath, { path: sourcePath, role: source.role });
  }
  const slugs = new Set();
  for (const document of manifest.documents) {
    if (!document || typeof document.slug !== "string" || !/^[a-z0-9-]+$/.test(document.slug)) {
      throw new Error("Corpus document slugs must be lower-case kebab-case");
    }
    if (slugs.has(document.slug)) {
      throw new Error(`Corpus manifest repeats document slug ${document.slug}`);
    }
    slugs.add(document.slug);
    if (document.startHeading && document.startText) {
      throw new Error(`Corpus document ${document.slug} cannot declare both startHeading and startText`);
    }
    if (document.startText && typeof document.startText !== "string") {
      throw new Error(`Corpus document ${document.slug} must use a string startText`);
    }
    if (document.anchor && !/^[a-z0-9-]+$/.test(document.anchor)) {
      throw new Error(`Corpus document ${document.slug} must use a portable anchor`);
    }
    const sourcePath = portablePath(document.source);
    if (!sources.has(sourcePath)) {
      throw new Error(`Corpus document ${document.slug} references undeclared source ${sourcePath}`);
    }
  }
  return sources;
}

function normaliseLinkTarget(value) {
  return typeof value === "string" ? value.trim().replace(/\\/g, "/").replace(/\.md$/i, "").toLowerCase() : "";
}

/**
 * @param {{ root?: string, manifestPath?: string }} input
 */
export async function compileCorpusKnowledge({ root = PROJECT_ROOT, manifestPath = "antichrist-vault/knowledge-manifest.json" } = {}) {
  const rootPath = path.resolve(root);
  const manifestRelativePath = portablePath(manifestPath);
  const manifest = JSON.parse(await readFile(path.join(rootPath, manifestRelativePath), "utf8"));
  const sources = validateManifest(manifest);
  const sourceText = new Map();
  for (const source of sources.values()) {
    sourceText.set(source.path, await readFile(path.join(rootPath, source.path), "utf8"));
  }

  const documents = manifest.documents
    .map((document) => {
      const sourcePath = portablePath(document.source);
      const extracted = extractSelection(sourceText.get(sourcePath), document);
      const blocks = markdownSelectionToBlocks(extracted.section);
      if (blocks.length < 2) {
        throw new Error(`Corpus document ${document.slug} has no substantive source-derived blocks`);
      }
      return {
        slug: document.slug,
        contentRevision: manifest.contentRevision,
        sourceCoordinates: [`${sourcePath}#${extracted.anchor}`],
        wikilinks: extractWikiLinks(extracted.section),
        body: JSON.stringify(blocks),
      };
    })
    .sort((left, right) => left.slug.localeCompare(right.slug));

  return {
    schemaVersion: 1,
    linkTargets: Object.fromEntries(
      Object.entries(manifest.linkTargets ?? {}).sort(([left], [right]) => left.localeCompare(right)),
    ),
    sources: [...sources.values()].sort((left, right) => left.path.localeCompare(right.path)),
    documents,
  };
}

export function renderCompiledCorpus(compiled) {
  return `${JSON.stringify(compiled, null, 2)}\n`;
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name, fallback) => {
    const index = args.indexOf(name);
    return index === -1 ? fallback : args[index + 1];
  };
  const output = option("--out", "apps/desktop/src-tauri/src/db/corpus_knowledge.generated.json");
  const check = args.includes("--check");
  const compiled = renderCompiledCorpus(
    await compileCorpusKnowledge({ manifestPath: option("--manifest", "antichrist-vault/knowledge-manifest.json") }),
  );
  const outputPath = path.join(PROJECT_ROOT, portablePath(output));
  if (check) {
    const existing = await readFile(outputPath, "utf8");
    if (existing !== compiled) {
      throw new Error(`Corpus artifact is stale: run node scripts/compile-corpus-knowledge.mjs --out ${output}`);
    }
    return;
  }
  await writeFile(outputPath, compiled);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
