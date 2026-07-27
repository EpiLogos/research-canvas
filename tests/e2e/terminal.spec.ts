import { expect, test } from "@playwright/test";

test("embedded terminal connects to a real shell session", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Terminal" }).dispatchEvent("click");

  const terminal = page.locator(".terminal-pane");
  await expect(terminal).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Terminal input" })).toBeVisible();
  await expect(terminal).toContainText("Connected to", { timeout: 5_000 });
});
