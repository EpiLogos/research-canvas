import { expect, test } from "@playwright/test";

test("T8 shell layout: top bar, sidebar, stage and status render", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("shell-top-bar")).toBeVisible();
  await expect(page.getByTestId("shell-left-sidebar")).toBeVisible();
  await expect(page.getByTestId("shell-stage")).toBeVisible();
  await expect(page.getByTestId("status-strip")).toBeVisible();
});

test("T8 shell layout: pipeline rail switches surfaces", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("canvas-pane")).toBeVisible();

  await page.getByTestId("lens-timeline").click();
  await expect(page.getByTestId("timeline-pane")).toBeVisible();

  await page.getByTestId("lens-psychogeographic").click();
  await expect(page.getByTestId("psychogeographic-pane")).toBeVisible();

  await page.getByTestId("lens-story").click();
  await expect(page.getByTestId("story-pane")).toBeVisible();

  await page.getByTestId("lens-palace").click();
  await expect(page.getByTestId("palace-pane")).toBeVisible();

  await page.getByTestId("lens-canvas").click();
  await expect(page.getByTestId("canvas-pane")).toBeVisible();
});

test("T8 shell layout: left sidebar expands and collapses", async ({ page }) => {
  await page.goto("/");

  const sidebar = page.getByTestId("shell-left-sidebar");
  await expect(sidebar).toHaveAttribute("data-open", "false");

  await page.getByRole("button", { name: "Files & Constellation" }).click();
  await expect(sidebar).toHaveAttribute("data-open", "true");

  await page.getByRole("button", { name: "Files & Constellation" }).click();
  await expect(sidebar).toHaveAttribute("data-open", "false");
});
