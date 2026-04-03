import { expect, test } from "@playwright/test";
import {
  expectNoCanvasError,
  openRightTab,
  selectFirstNoteNode,
  selectCanvasNode,
  waitForWorkspace,
} from "./support/canvas";

test("restores persisted authoring state after browser storage is cleared", async ({
  page,
  context
}) => {
  await page.goto("/");
  await waitForWorkspace(page);

  await page.getByRole("button", { name: "Add note node" }).click();
  await page.getByRole("button", { name: "Add resource node" }).click();
  await page.locator(".fuzzy-picker-item", { hasText: "README.md" }).click();
  await page.getByRole("button", { name: "Create sequence" }).click();

  await page.locator(".canvas-flow .note-node__preview").first().dblclick();
  await page.getByLabel("Edit note").fill("Reload proof for the canvas.");
  await page.locator(".canvas-footer").click();

  await openRightTab(page, "Sequences");
  await page.getByRole("button", { name: "Add selected node" }).click();
  await selectCanvasNode(page, "README.md");
  await openRightTab(page, "Sequences");
  await page.getByRole("button", { name: "Add selected node" }).click();

  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await waitForWorkspace(page);

  await expect(page.locator(".canvas-footer")).toContainText("2 nodes");
  await expect(page.locator(".canvas-footer")).toContainText("1 sequences");
  await selectFirstNoteNode(page);
  await openRightTab(page, "Content");
  await expect(page.getByLabel("Note content")).toHaveValue("Reload proof for the canvas.");
  await expectNoCanvasError(page);

  const reopenedPage = await context.newPage();
  await reopenedPage.goto("/");
  await waitForWorkspace(reopenedPage);

  await expect(reopenedPage.locator(".canvas-footer")).toContainText("2 nodes");
  await expect(reopenedPage.locator(".canvas-footer")).toContainText("1 sequences");
  await selectFirstNoteNode(reopenedPage);
  await openRightTab(reopenedPage, "Content");
  await expect(reopenedPage.getByLabel("Note content")).toHaveValue("Reload proof for the canvas.");
  await expectNoCanvasError(reopenedPage);
});
