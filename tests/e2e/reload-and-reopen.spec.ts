import { expect, test } from "@playwright/test";

test("restores persisted authoring state after browser storage is cleared", async ({
  page,
  context
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Add note node" }).click();
  await page.getByRole("button", { name: "Add resource node" }).click();
  await page.getByRole("button", { name: "Link latest nodes" }).click();
  await page.getByRole("button", { name: "Draw annotation" }).click();

  const overlay = page.getByTestId("annotation-surface");
  await overlay.hover();
  await page.mouse.down();
  await page.mouse.move(280, 220, { steps: 8 });
  await page.mouse.move(360, 260, { steps: 8 });
  await page.mouse.up();

  await page.getByRole("button", { name: "Create sequence" }).click();
  await page.getByRole("button", { name: "Add latest nodes to sequence" }).click();

  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await expect(page.getByRole("heading", { name: "Opening note" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Source report" })).toBeVisible();
  await expect(page.getByTestId("annotation-count")).toHaveText("1");
  await expect(page.getByText("Episode flow")).toBeVisible();
  await expect(page.getByTestId("sequence-step-count")).toHaveText("2");

  const reopenedPage = await context.newPage();
  await reopenedPage.goto("/");

  await expect(
    reopenedPage.getByRole("heading", { name: "Opening note" })
  ).toBeVisible();
  await expect(
    reopenedPage.getByRole("heading", { name: "Source report" })
  ).toBeVisible();
  await expect(reopenedPage.getByTestId("annotation-count")).toHaveText("1");
  await expect(reopenedPage.getByText("Episode flow")).toBeVisible();
  await expect(reopenedPage.getByTestId("sequence-step-count")).toHaveText("2");
});
