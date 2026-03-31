import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { createSampleExportBundle } from "../fixtures/export-fixture";
import { writeStaticExport } from "../../packages/exporter/src/index";

test("published resources stay downloadable from the exported bundle", async ({
  page
}) => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "research-canvas-downloads-"));
  await writeStaticExport(createSampleExportBundle(), outputDir);

  await page.goto(`file://${path.join(outputDir, "index.html")}`);

  await expect(
    page.getByRole("link", { name: /download README.md/i })
  ).toHaveAttribute("href", "assets/README.md");
  await expect(
    page.getByRole("link", { name: /download example.png/i })
  ).toHaveAttribute("href", "assets/example.png");
});
