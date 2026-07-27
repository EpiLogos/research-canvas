import { expect, test } from "@playwright/test";
import {
  currentNodeCount,
  expectNoCanvasError,
  waitForWorkspace,
} from "./support/canvas";

test("restores the graph-backed canvas after reload", async ({
  page
}) => {
  await page.goto("/");
  await waitForWorkspace(page);
  const initialNodeCount = await currentNodeCount(page);

  await expect(page.locator(".canvas-flow")).toContainText("Christ Sixfold Spectral Lineage");
  await expectNoCanvasError(page);

  await page.reload();
  await waitForWorkspace(page);

  await expect(page.locator(".canvas-footer")).toContainText(`${initialNodeCount} nodes`);
  await expect(page.locator(".canvas-flow")).toContainText("Christ Sixfold Spectral Lineage");
  await expectNoCanvasError(page);
});
