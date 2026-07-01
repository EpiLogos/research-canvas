import fs from "node:fs/promises";
import path from "node:path";

import type { ExportBundle } from "@research-canvas/schema";

import { buildSearchIndex } from "./buildSearchIndex";
import { copyAssets } from "./copyAssets";
import { buildExportManifest } from "./manifest";
import { renderMarkdownToHtml } from "./renderMarkdown";

export { buildSearchIndex } from "./buildSearchIndex";
export { copyAssets } from "./copyAssets";
export { buildExportManifest, slugify } from "./manifest";
export type { ExportManifest, ExportNodePage } from "./manifest";
export { blockNoteJsonToMarkdown, markdownToBlockNoteJson, renderMarkdownToHtml } from "./renderMarkdown";

export interface StaticExportResult {
  outputDir: string;
  projectId: string;
  nodePageCount: number;
  assetCount: number;
}

export async function writeStaticExport(
  bundle: ExportBundle,
  outputDir: string
): Promise<StaticExportResult> {
  const manifest = buildExportManifest(bundle);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(path.join(outputDir, "nodes"), { recursive: true });

  const bundleJson = JSON.stringify(bundle, null, 2);
  const manifestJson = JSON.stringify(manifest, null, 2);
  const searchIndexJson = JSON.stringify(buildSearchIndex(bundle), null, 2);

  await fs.writeFile(path.join(outputDir, "bundle.json"), bundleJson, "utf8");
  await fs.writeFile(path.join(outputDir, "manifest.json"), manifestJson, "utf8");
  await fs.writeFile(
    path.join(outputDir, "search-index.json"),
    searchIndexJson,
    "utf8"
  );

  for (const page of manifest.nodePages) {
    const node = manifest.nodes.find((entry) => entry.id === page.nodeId);
    if (!node) {
      continue;
    }
    const html = renderNodePage(manifest.project, node, manifest, page.slug);
    await fs.writeFile(path.join(outputDir, page.href), html, "utf8");
  }

  await copyAssets(manifest.assets, outputDir);
  await fs.writeFile(path.join(outputDir, "index.html"), renderIndexPage(manifest), "utf8");

  return {
    assetCount: manifest.assets.length,
    nodePageCount: manifest.nodePages.length,
    outputDir,
    projectId: manifest.project.id
  };
}

function renderIndexPage(manifest: ReturnType<typeof buildExportManifest>) {
  const nodeCards = manifest.nodePages
    .map((page) => {
      const node = manifest.nodes.find((entry) => entry.id === page.nodeId);
      if (!node) {
        return "";
      }

      return `
        <article class="card card--node">
          <a class="card__link" href="${page.href}">
            <h3>${escapeHtml(node.title)}</h3>
            <p>${escapeHtml(node.summary || node.type)}</p>
          </a>
        </article>`;
    })
    .join("");

  const notePreview = manifest.nodes.find((node) => node.type === "note");
  const noteHtml =
    notePreview && notePreview.type === "note"
      ? `
        <section class="viewer-section viewer-section--note">
          <header><p class="eyebrow">Note</p><h2>${escapeHtml(notePreview.title)}</h2></header>
          <div class="markdown">${renderMarkdownToHtml(notePreview.content)}</div>
        </section>`
      : "";

  const downloads = manifest.assets
    .map(
      (asset) =>
        `<li><a href="assets/${escapeHtml(asset.downloadName)}">Download ${escapeHtml(asset.downloadName)}</a></li>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(manifest.project.displayName)}</title>
    <style>${viewerStyles()}</style>
  </head>
  <body>
    <main class="viewer">
      <section class="viewer__hero">
        <p class="eyebrow">Static export</p>
        <h1>${escapeHtml(manifest.project.displayName)}</h1>
        <p>${escapeHtml(manifest.project.summary || "Published research canvas")}</p>
      </section>
      <section class="viewer__desktop">
        <section class="viewer-section viewer-section--map">
          <header><p class="eyebrow">Map</p><h2>Canvas nodes</h2></header>
          <div class="card-grid">${nodeCards}</div>
        </section>
        ${noteHtml}
        <section class="viewer-section viewer-section--downloads">
          <header><p class="eyebrow">Downloads</p><h2>Published resources</h2></header>
          <ul class="download-list">${downloads}</ul>
        </section>
      </section>
      <section class="viewer__mobile">
        <header class="mobile-hero">
          <p class="eyebrow">Mobile mode</p>
          <h2>Resource exploration</h2>
          <p>Browse published resources and notes.</p>
        </header>
      </section>
    </main>
  </body>
</html>`;
}

function renderNodePage(
  project: ReturnType<typeof buildExportManifest>["project"],
  node: ReturnType<typeof buildExportManifest>["nodes"][number],
  manifest: ReturnType<typeof buildExportManifest>,
  _slug: string
) {
  const relatedEdges = manifest.edges.filter(
    (edge) => edge.sourceNodeId === node.id || edge.targetNodeId === node.id
  );
  const downloads = manifest.assets.filter((asset) => asset.nodeId === node.id);
  const content =
    node.type === "note"
      ? `<div class="markdown">${renderMarkdownToHtml(node.content)}</div>`
      : `<p>${escapeHtml(
          node.type === "resource" ? node.relativePath : node.summary || "Published node"
        )}</p>`;

  const resourcePreview =
    node.type === "resource"
      ? `
        <section class="viewer-section">
          <header><p class="eyebrow">Resource</p><h2>${escapeHtml(node.title)}</h2></header>
          <dl class="meta-list">
            <div><dt>Kind</dt><dd>${escapeHtml(node.resourceKind)}</dd></div>
            <div><dt>Path</dt><dd>${escapeHtml(node.relativePath)}</dd></div>
            <div><dt>Mime type</dt><dd>${escapeHtml(node.mimeType)}</dd></div>
          </dl>
        </section>`
      : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(node.title)} - ${escapeHtml(project.displayName)}</title>
    <style>${viewerStyles()}</style>
  </head>
  <body>
    <main class="viewer viewer--node">
      <a class="back-link" href="../index.html">Back to project</a>
      <section class="viewer__hero">
        <p class="eyebrow">Node page</p>
        <h1>${escapeHtml(node.title)}</h1>
        <p>${escapeHtml(node.summary || node.type)}</p>
      </section>
      ${resourcePreview}
      <section class="viewer-section">
        <header><p class="eyebrow">Content</p><h2>Rendered view</h2></header>
        ${content}
      </section>
      <section class="viewer-section">
        <header><p class="eyebrow">Relations</p><h2>Related nodes</h2></header>
        <ul class="relation-list">
          ${relatedEdges
            .map((edge) => {
              const otherNode =
                manifest.nodes.find((entry) => entry.id === edge.sourceNodeId && edge.targetNodeId !== node.id) ??
                manifest.nodes.find((entry) => entry.id === edge.targetNodeId && edge.sourceNodeId !== node.id);
              return `<li><strong>${escapeHtml(otherNode?.title ?? "Unknown")}</strong> <span>${escapeHtml(edge.relationKind)}</span></li>`;
            })
            .join("")}
        </ul>
      </section>
      <section class="viewer-section">
        <header><p class="eyebrow">Downloads</p><h2>Source files</h2></header>
        <ul class="download-list">
          ${downloads
            .map(
              (asset) =>
                `<li><a href="../assets/${escapeHtml(asset.downloadName)}">Download ${escapeHtml(asset.downloadName)}</a></li>`
            )
            .join("")}
        </ul>
      </section>
    </main>
  </body>
</html>`;
}

function viewerStyles() {
  return `
    :root {
      color-scheme: light;
      --bg: #f3efe6;
      --panel: #fffaf0;
      --ink: #1f1c18;
      --muted: #645b50;
      --line: rgba(31, 28, 24, 0.12);
      --accent: #a85f1f;
      --shadow: 0 16px 42px rgba(34, 28, 18, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-serif, Georgia, Cambria, "Times New Roman", serif;
      background: radial-gradient(circle at top, #fff8ea 0%, var(--bg) 48%, #e8dfd0 100%);
      color: var(--ink);
    }
    a { color: var(--accent); }
    .viewer {
      max-width: 1200px;
      margin: 0 auto;
      padding: 32px;
      display: grid;
      gap: 24px;
    }
    .viewer__desktop,
    .viewer__mobile {
      display: grid;
      gap: 24px;
    }
    .viewer__hero,
    .viewer-section,
    .card,
    .mobile-hero {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 22px;
      box-shadow: var(--shadow);
      padding: 24px;
    }
    .eyebrow {
      margin: 0 0 8px;
      text-transform: uppercase;
      letter-spacing: 0.16em;
      font-size: 0.72rem;
      color: var(--muted);
    }
    h1, h2, h3, p { margin-top: 0; }
    .card-grid,
    .mobile-stack {
      display: grid;
      gap: 16px;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    }
    .card__link {
      display: block;
      color: inherit;
      text-decoration: none;
    }
    .download-list,
    .relation-list,
    .step-list {
      margin: 0;
      padding-left: 1.25rem;
      display: grid;
      gap: 12px;
    }
    .meta-list {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }
    .meta-list dt {
      font-size: 0.8rem;
      color: var(--muted);
    }
    .meta-list dd {
      margin: 0;
      font-weight: 600;
    }
    .markdown h1,
    .markdown h2,
    .markdown h3,
    .markdown h4,
    .markdown h5,
    .markdown h6 {
      margin-bottom: 0.4rem;
    }
    .back-link {
      align-self: start;
    }
    .viewer__mobile {
      display: none;
    }
    @media (max-width: 760px) {
      .viewer__desktop {
        display: none;
      }
      .viewer__mobile {
        display: grid;
      }
    }
  `;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}
