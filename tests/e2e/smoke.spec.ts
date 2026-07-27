import { expect, test } from "@playwright/test";

test("desktop shell boots", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("tab", { name: "Canvas" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Timeline" })).toBeVisible();
  await expect(page.getByTestId("canvas-pane")).toBeVisible();
  await expect(page.getByTestId("status-strip")).toContainText("synced");
  await expect(page.getByTestId("status-strip")).toContainText("nodes");
});
