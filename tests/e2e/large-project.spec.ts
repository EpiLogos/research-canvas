import { expect, test } from "@playwright/test";

test("indexes the larger vault instead of showing an empty placeholder explorer", async ({
  page
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("button", { name: /Report6\.md markdown/i })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /episode-2-research-timeline\.md markdown/i })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /episode-1-2-archetypal-resonance\.mmd binary/i })
  ).toBeVisible();
});
