import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { createSampleExportBundle } from "../fixtures/export-fixture";
import { writeStaticExport } from "../../packages/exporter/src/index";

test("public viewer opens a real exported bundle and falls back on mobile", async ({
  page
}) => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "research-canvas-viewer-"));
  await writeStaticExport(createSampleExportBundle(), outputDir);

  await page.goto(`file://${path.join(outputDir, "index.html")}`);

  await expect(page.getByRole("heading", { name: "Sample Project" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Opening note", level: 2 })
  ).toBeVisible();

  await page.setViewportSize({ width: 360, height: 720 });
  await page.reload();

  await expect(
    page.getByRole("heading", { name: /resource exploration/i })
  ).toBeVisible();
});
