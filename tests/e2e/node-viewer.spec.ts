import { expect, test } from "@playwright/test";
import {
  expectNoCanvasError,
  openConstellation,
  waitForWorkspace,
} from "./support/canvas";

test("opens graph-backed node content in the reader", async ({
  page
}) => {
  await page.goto("/");
  await waitForWorkspace(page);

  await openConstellation(page, "Christ Sixfold Spectral Lineage");
  const node = page.locator(".react-flow__node").first();
  await expect(node).toBeAttached();
  await node.dispatchEvent("dblclick");
  await expect(page.getByTestId("reading-overlay")).toBeVisible();
  await expect(page.getByTestId("reading-overlay").getByRole("heading").first()).toBeVisible();
  await expectNoCanvasError(page);
});

test("opens a nested constellation from the workspace explorer", async ({
  page
}) => {
  await page.goto("/");
  await waitForWorkspace(page);

  await openConstellation(page, "Christ Sixfold Spectral Lineage");

  await expect(page.getByRole("tab", { name: "Christ Sixfold Spectral Lineage" })).toBeVisible();
  await expect(page.locator(".canvas-footer")).not.toContainText("18 nodes");
  await expectNoCanvasError(page);
});
