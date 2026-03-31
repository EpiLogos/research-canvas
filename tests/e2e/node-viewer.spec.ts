import { expect, test } from "@playwright/test";

test("opens a selected node into the focused viewer with rendered markdown", async ({
  page
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Add note node" }).click();
  await page.getByRole("button", { name: "Add resource node" }).click();
  await page.getByRole("button", { name: "Opening note" }).click();

  await expect(page.getByRole("button", { name: "Open focused view" })).toBeVisible();
  await page.getByRole("button", { name: "Open focused view" }).click();

  await expect(page).toHaveURL(/\/node\//);
  await expect(
    page.getByTestId("node-viewer").locator(".markdown-viewer__heading"),
  ).toHaveText("Opening note");
  await expect(page.getByText("The thesis starts here.")).toBeVisible();
});
