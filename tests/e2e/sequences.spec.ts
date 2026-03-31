import { expect, test } from "@playwright/test";

test("creates a sequence, adds ordered node steps, and plays them back", async ({
  page
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Add note node" }).click();
  await page.getByRole("button", { name: "Add resource node" }).click();
  await page.getByRole("button", { name: "Create sequence" }).click();
  await page.getByRole("button", { name: "Add latest nodes to sequence" }).click();

  await expect(page.getByText("Episode flow")).toBeVisible();
  await expect(page.getByTestId("sequence-step-count")).toHaveText("2");

  await page.getByRole("button", { name: "Play next step" }).click();
  await expect(page.getByText("Support it with the report")).toBeVisible();
  await expect(page.getByTestId("sequence-active-step")).toHaveText("2");
});
