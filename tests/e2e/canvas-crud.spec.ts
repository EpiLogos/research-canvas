import { expect, test } from "@playwright/test";
import {
  expectNoCanvasError,
  selectCanvasNode,
  waitForWorkspace,
} from "./support/canvas";

test("creates nodes and restores the canvas after reload", async ({
  page
}) => {
  await page.goto("/");
  await waitForWorkspace(page);

  await page.getByRole("button", { name: "Add note node" }).click();
  await page.getByRole("button", { name: "Add resource node" }).click();
  await page.locator(".fuzzy-picker-item", { hasText: "README.md" }).click();
  await selectCanvasNode(page, "README.md");

  await expect(page.locator(".canvas-footer")).toContainText("2 nodes");
  await expectNoCanvasError(page);

  await page.reload();
  await waitForWorkspace(page);

  await expect(page.locator(".canvas-footer")).toContainText("2 nodes");
  await expect(page.locator(".canvas-flow")).toContainText("README.md");
  await expectNoCanvasError(page);
});
