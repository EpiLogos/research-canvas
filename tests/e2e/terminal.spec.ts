import { expect, test } from "@playwright/test";

test("embedded terminal connects to a real shell session", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Show terminal" }).click();

  await expect(page.getByTestId("terminal-pane")).toBeVisible();

  await expect(page.getByTestId("terminal-transcript")).toContainText(
    "Connected to"
  );
  await expect(page.getByText(/cwd:/i)).toBeVisible();
});
