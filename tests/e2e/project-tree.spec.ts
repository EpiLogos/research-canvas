import { expect, test } from "@playwright/test";

test("shows the root constellation and indexed vault entries in the left rail", async ({
  page
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("button", { name: /Root Archetypal Field/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /episodes directory/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /episode-1-2-archetypal-resonance\.md markdown/i }),
  ).toBeVisible();
});
