import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createSampleExportBundle } from "../../../tests/fixtures/export-fixture";
import { buildExportManifest, writeStaticExport } from "./index";
import { buildSearchIndex } from "./buildSearchIndex";
import { renderMarkdownToHtml } from "./renderMarkdown";

describe("exporter", () => {
  it("builds a manifest and static export from a real bundle", async () => {
    const bundle = createSampleExportBundle();
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "research-canvas-export-"));

    const manifest = buildExportManifest(bundle);
    expect(manifest.project.slug).toBe("sample-project");
    expect(manifest.nodePages).toHaveLength(2);
    expect(manifest.assets).toHaveLength(2);
    expect(buildSearchIndex(bundle).some((entry) => entry.title === "Opening note")).toBe(true);

    await writeStaticExport(bundle, outputDir);

    expect(fs.existsSync(path.join(outputDir, "index.html"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "bundle.json"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "nodes", "opening-note.html"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "assets", "README.md"))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, "assets", "example.png"))).toBe(true);
  });

  it("renders markdown into rich static HTML", () => {
    const html = renderMarkdownToHtml(`# Opening note\n\n- first point\n- second point\n\n[source](https://example.com)`);

    expect(html).toContain("<h1>Opening note</h1>");
    expect(html).toContain("<li>first point</li>");
    expect(html).toContain('href="https://example.com"');
  });
});
