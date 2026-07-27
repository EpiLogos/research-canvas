import { expect, test } from "@playwright/test";
import { waitForWorkspace } from "./support/canvas";

test("draws a freehand annotation and restores it after reload", async ({
  page
}) => {
  await page.goto("/");
  await waitForWorkspace(page);

  await page.getByRole("button", { name: "Annotations" }).click();
  await page.getByRole("button", { name: "Start drawing" }).click();

  const overlay = page.getByTestId("annotation-surface");
  await overlay.hover();
  await page.mouse.down();
  await page.mouse.move(260, 240, { steps: 8 });
  await page.mouse.move(340, 280, { steps: 8 });
  await page.mouse.up();

  await expect(page.getByText("stroke", { exact: true })).toBeVisible();
  await expect(page.getByTestId("annotation-count")).toHaveText("1 annotations");
  await page.waitForTimeout(750);

  await page.reload();

  await expect(page.getByTestId("annotation-count")).toHaveText("1 annotations");
  await page.getByRole("button", { name: "Annotations" }).dispatchEvent("click");
  await expect(page.locator(".annotations-panel__item-type", { hasText: "stroke" })).toBeAttached();
});
