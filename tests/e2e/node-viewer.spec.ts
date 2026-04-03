import { expect, test } from "@playwright/test";
import {
  expectNoCanvasError,
  openRightTab,
  selectFirstNoteNode,
  selectCanvasNode,
  waitForWorkspace,
} from "./support/canvas";

test("edits note content and restores it after reload", async ({
  page
}) => {
  await page.goto("/");
  await waitForWorkspace(page);

  await page.getByRole("button", { name: "Add note node" }).click();
  await page.locator(".canvas-flow .note-node__preview").first().dblclick();
  await page.getByLabel("Edit note").fill("The live thesis now persists.");
  await page.locator(".canvas-footer").click();

  await page.reload();
  await waitForWorkspace(page);
  await selectFirstNoteNode(page);
  await openRightTab(page, "Content");

  await expect(page.getByLabel("Note content")).toHaveValue("The live thesis now persists.");
  await expect(page.locator(".canvas-flow")).toContainText("The live thesis now persists.");
  await expectNoCanvasError(page);
});

test("renders markdown resources in the content panel", async ({
  page
}) => {
  await page.goto("/");
  await waitForWorkspace(page);

  await page.getByRole("button", { name: "Add resource node" }).click();
  await page.locator(".fuzzy-picker-item", { hasText: "README.md" }).click();
  await selectCanvasNode(page, "README.md");
  await openRightTab(page, "Content");

  await expect(page.getByRole("heading", { name: "Sample Project" })).toBeVisible();
  await expect(page.getByText("This fixture mirrors a small research workspace")).toBeVisible();
  await expectNoCanvasError(page);
});
