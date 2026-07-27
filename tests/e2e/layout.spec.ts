import { expect, test } from "@playwright/test";

test("desktop shell renders its primary regions and opens local tools", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("left-rail")).toBeVisible();
  await expect(page.getByTestId("canvas-pane")).toBeVisible();
  await expect(page.getByTestId("status-strip")).toBeVisible();

  await page.locator(".react-flow__node").first().dispatchEvent("click");
  await expect(page.getByTestId("inspector-overlay")).toBeVisible();

  await page.getByRole("button", { name: "Terminal" }).dispatchEvent("click");
  await expect(page.getByTestId("bottom-dock")).toBeVisible();
});
