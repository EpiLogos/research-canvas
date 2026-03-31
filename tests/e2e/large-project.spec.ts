import { expect, test } from "@playwright/test";

test("indexes a larger nested project instead of showing an empty placeholder explorer", async ({
  page
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: /ep-0\.2 Research reports and media assets/i }).click();

  await expect(
    page.getByRole("button", { name: /Report1\.md markdown/i })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Report8\.md markdown/i })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /NotebookLM Mind Map \(1\)\.png image/i })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /The_Chiaroscuro_Ledger\.pptx binary/i })
  ).toBeVisible();
});
