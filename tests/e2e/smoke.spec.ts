import { expect, test } from "@playwright/test";

test("desktop shell boots", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: /research canvas/i })).toBeVisible();
  await expect(page.getByTestId("shell")).toBeVisible();
});

