import { expect, test } from "@playwright/test";

test("T9 terminal modal: toggles open and closed with status indicator", async ({ page }) => {
  await page.goto("/");

  // Terminal is closed by default; the status strip still shows the indicator.
  await expect(page.getByTestId("terminal-status-indicator")).toBeVisible();
  await expect(page.getByTestId("terminal-status-indicator")).toHaveAttribute("data-active", "false");

  // Open via the top-bar toggle.
  await page.getByTestId("top-bar-terminal-toggle").click();
  await expect(page.getByTestId("terminal-modal")).toBeVisible();
  await expect(page.getByTestId("terminal-status-indicator")).toHaveAttribute("data-active", "true");

  // Adjust opacity using the slider.
  const modal = page.getByTestId("terminal-modal");
  const slider = page.getByTestId("terminal-opacity-slider");
  await slider.fill("0.6");
  await expect(modal).toHaveCSS("opacity", "0.6");

  // Close via the header close button.
  await page.getByRole("button", { name: "Close terminal" }).click();
  await expect(page.getByTestId("terminal-modal")).not.toBeVisible();
  await expect(page.getByTestId("terminal-status-indicator")).toHaveAttribute("data-active", "false");
});

test("T9 terminal modal: toggles via keyboard shortcut", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("terminal-modal")).not.toBeVisible();

  await page.keyboard.press("Control+j");
  await expect(page.getByTestId("terminal-modal")).toBeVisible();

  await page.keyboard.press("Control+j");
  await expect(page.getByTestId("terminal-modal")).not.toBeVisible();
});
