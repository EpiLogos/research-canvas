import { expect, test } from "@playwright/test";

import { waitForWorkspace } from "./support/canvas";

test.describe("Sequences", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForWorkspace(page);
  });

  test("creates and restores a saved local sequence", async ({ page }) => {
    await page.getByRole("button", { name: "Sequences" }).dispatchEvent("click");
    await page.getByRole("button", { name: "+ New" }).click();
    await expect(page.getByRole("button", { name: /Sequence 1/ })).toBeVisible();

    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Sequences" }).dispatchEvent("click");
    await expect(page.getByRole("button", { name: /Sequence 1/ })).toBeVisible();
  });

  test("deletes a saved local sequence", async ({ page }) => {
    await page.getByRole("button", { name: "Sequences" }).dispatchEvent("click");
    await page.getByRole("button", { name: "+ New" }).click();
    await expect(page.getByRole("button", { name: /Sequence 1/ })).toBeVisible();

    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("No sequences saved. Create one to define a guided path.")).toBeVisible();
  });
});
