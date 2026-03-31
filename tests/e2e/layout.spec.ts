import { expect, test } from "@playwright/test";

test("desktop shell renders the four primary regions", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("left-rail")).toBeVisible();
  await expect(page.getByTestId("canvas-pane")).toBeVisible();
  await expect(page.getByTestId("right-panel")).toBeVisible();
  await expect(page.getByTestId("bottom-dock")).toBeVisible();
});

