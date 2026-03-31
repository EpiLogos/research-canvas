import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { createSampleExportBundle } from "../fixtures/export-fixture";
import { writeStaticExport } from "../../packages/exporter/src/index";

test("exports a static bundle that opens as a self-contained viewer", async ({
  page
}) => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "research-canvas-export-"));
  await writeStaticExport(createSampleExportBundle(), outputDir);

  await page.goto(`file://${path.join(outputDir, "index.html")}`);

  await expect(page.getByRole("heading", { name: "Sample Project" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Opening note", level: 2 })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /download README.md/i })).toBeVisible();
});
