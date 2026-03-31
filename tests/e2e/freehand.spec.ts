import { expect, test } from "@playwright/test";

test("draws a freehand annotation and restores it after reload", async ({
  page
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Draw annotation" }).click();

  const overlay = page.getByTestId("annotation-surface");
  await overlay.hover();
  await page.mouse.down();
  await page.mouse.move(260, 240, { steps: 8 });
  await page.mouse.move(340, 280, { steps: 8 });
  await page.mouse.up();

  await expect(page.getByText("stroke")).toBeVisible();
  await expect(page.getByTestId("annotation-count")).toHaveText("1");

  await page.reload();

  await expect(page.getByText("stroke")).toBeVisible();
  await expect(page.getByTestId("annotation-count")).toHaveText("1");
});
