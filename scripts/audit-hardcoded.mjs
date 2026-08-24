import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const roots = [
  "apps/desktop/src/features",
  "packages/canvas/src",
  "apps/public-viewer/src",
];

const obsoleteProductionPaths = new Set([
  "apps/desktop/src/features/psychogeographic/assembleWalk.ts",
  "apps/desktop/src/features/psychogeographic/seedGeographyEdges.ts",
  "apps/desktop/src/features/psychogeographic/walkFixture.ts",
  "apps/desktop/src/features/story/seedMigrationStory.ts",
]);

const forbiddenIdentifiers = [
  "initialNodes",
  "defaultNodes",
  "seedNodes",
  "sampleNodes",
  "assembleProfileWalk",
  "ensureGeographyEdgeSeed",
  "ensureMigrationStorySeed",
];

const directTransport = /\btransport\.(?:list|read|load|get|upsert|save|write|create|update|delete|register|stage|apply|mark|connect|disconnect)[A-Z]\w*\s*\(/g;
const surfaceComponent = /(?:Lens|Surface|Host|Dialog|Editor)\.(?:ts|tsx)$/;

function isProductionSource(file) {
  return /\.(?:ts|tsx|js|jsx)$/.test(file)
    && !/\.(?:test|spec)\.(?:ts|tsx|js|jsx)$/.test(file)
    && !file.split("/").some((segment) => segment === "fixtures" || segment === "__fixtures__");
}

async function walk(root) {
  try {
    const info = await stat(root);
    if (!info.isDirectory()) return [];
  } catch {
    return [];
  }
  const out = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const child = path.posix.join(root, entry.name);
    if (entry.isDirectory()) out.push(...await walk(child));
    else out.push(child);
  }
  return out;
}

const files = (await Promise.all(roots.map(walk))).flat().filter(isProductionSource);
const violations = [];
for (const obsolete of obsoleteProductionPaths) {
  if (files.includes(obsolete)) violations.push(`${obsolete}: obsolete production seed/fixture path still exists`);
}

for (const file of files) {
  const source = await readFile(file, "utf8");
  const lines = source.split("\n");
  for (const identifier of forbiddenIdentifiers) {
    lines.forEach((line, index) => {
      if (line.includes(identifier)) violations.push(`${file}:${index + 1}: forbidden production identifier ${identifier}`);
    });
  }

  // Repository adapters, command hooks, terminal infrastructure and data-source
  // adapters are allowed to speak transport. Canonical rendered surface
  // components are not: they receive or compose repositories instead.
  if (file.startsWith("apps/desktop/src/features/") && surfaceComponent.test(file)) {
    lines.forEach((line, index) => {
      directTransport.lastIndex = 0;
      if (directTransport.test(line)) {
        violations.push(`${file}:${index + 1}: direct transport persistence/read bypasses a domain repository`);
      }
    });
  }
}

if (violations.length > 0) {
  console.error("Hardcoded/repository-boundary audit failed:\n" + violations.map((value) => `- ${value}`).join("\n"));
  process.exit(1);
}

console.log(`Hardcoded/repository-boundary audit passed (${files.length} production source files scanned).`);
