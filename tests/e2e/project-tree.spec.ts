import { expect, test } from "@playwright/test";

test("shows nested projects and indexed file entries in the left rail", async ({
  page
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("button", { name: /sample-project/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /README\.md markdown/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /example\.png image/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /outline\.md markdown/i }),
  ).toBeVisible();
});
