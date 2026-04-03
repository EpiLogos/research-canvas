import { expect, test } from "@playwright/test";
import {
  expectNoCanvasError,
  openRightTab,
  selectFirstNoteNode,
  selectCanvasNode,
  selectedCanvasNode,
  waitForWorkspace,
} from "./support/canvas";

test("creates a sequence, adds ordered node steps, and plays them back", async ({
  page
}) => {
  await page.goto("/");
  await waitForWorkspace(page);

  await page.getByRole("button", { name: "Add note node" }).click();
  await page.getByRole("button", { name: "Add resource node" }).click();
  await page.locator(".fuzzy-picker-item", { hasText: "README.md" }).click();
  await page.getByRole("button", { name: "Create sequence" }).click();

  await selectFirstNoteNode(page);
  await openRightTab(page, "Sequences");
  await page.getByRole("button", { name: "Add selected node" }).click();

  await selectCanvasNode(page, "README.md");
  await openRightTab(page, "Sequences");
  await page.getByRole("button", { name: "Add selected node" }).click();

  await expect(page.getByText("Episode flow")).toBeVisible();
  await expect(page.getByTestId("sequence-step-count")).toHaveText("2");
  await expect(page.getByTestId("sequence-active-step")).toHaveText("1");

  await page.getByRole("button", { name: "Play next step" }).click();
  await expect(page.getByTestId("sequence-active-step")).toHaveText("2");
  await expect(selectedCanvasNode(page)).toContainText("README.md");
  await expectNoCanvasError(page);
});
