import { expect, test } from "@playwright/test";
import {
  currentNodeCount,
  expectNoCanvasError,
  waitForWorkspace,
} from "./support/canvas";

test("restores the local graph workspace after browser storage is cleared", async ({
  page,
  context
}) => {
  await page.goto("/");
  await waitForWorkspace(page);
  const expectedNodeCount = await currentNodeCount(page);

  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await waitForWorkspace(page);

  await expect(page.getByRole("tab", { name: "Root Archetypal Field" })).toBeVisible();
  await expect(page.locator(".canvas-footer")).toContainText(`${expectedNodeCount} nodes`);
  await expectNoCanvasError(page);

  const reopenedPage = await context.newPage();
  await reopenedPage.goto("/");
  await waitForWorkspace(reopenedPage);

  await expect(reopenedPage.getByRole("tab", { name: "Root Archetypal Field" })).toBeVisible();
  await expect(reopenedPage.locator(".canvas-footer")).toContainText(`${expectedNodeCount} nodes`);
  await expectNoCanvasError(reopenedPage);
});
