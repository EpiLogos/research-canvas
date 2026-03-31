import { expect, test } from "@playwright/test";

test("creates nodes, connects them, and restores the canvas after reload", async ({
  page
}) => {
  await page.goto("/");
  const canvasFlow = page.locator(".canvas-flow");
  const connectionSummary = page.locator(".canvas-summary__panel").nth(1);

  await page.getByRole("button", { name: "Add note node" }).click();
  await page.getByRole("button", { name: "Add resource node" }).click();
  await page.getByRole("button", { name: "Link latest nodes" }).click();

  await expect(
    canvasFlow.getByRole("heading", { name: "Opening note" })
  ).toBeVisible();
  await expect(
    canvasFlow.getByRole("heading", { name: "Source report" })
  ).toBeVisible();
  await expect(connectionSummary.getByText("supports", { exact: true })).toBeVisible();

  await page.reload();

  await expect(
    canvasFlow.getByRole("heading", { name: "Opening note" })
  ).toBeVisible();
  await expect(
    canvasFlow.getByRole("heading", { name: "Source report" })
  ).toBeVisible();
  await expect(connectionSummary.getByText("supports", { exact: true })).toBeVisible();
  await expect(
    connectionSummary.getByText("Primary supporting source", { exact: true })
  ).toBeVisible();
});
