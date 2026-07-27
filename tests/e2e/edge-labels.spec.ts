import { expect, test } from "@playwright/test";

import {
  expectNoCanvasError,
  openConstellation,
  waitForWorkspace,
} from "./support/canvas";

test("renders graph knowledge metadata after reopening a constellation", async ({ page }) => {
  await page.goto("/");
  await waitForWorkspace(page);
  await openConstellation(page, "Christ Sixfold Spectral Lineage");

  const card = page.getByTestId("knowledge-card").first();
  await expect(card).toBeAttached();
  const title = (await card.locator(".knowledge-card__title").textContent())?.trim();
  const context = (await card.locator(".knowledge-card__chips").textContent())?.trim();
  expect(title).toBeTruthy();
  expect(context).toBeTruthy();

  await page.reload();
  await waitForWorkspace(page);
  await openConstellation(page, "Christ Sixfold Spectral Lineage");
  const reopenedCard = page.getByTestId("knowledge-card").filter({ hasText: title! }).first();
  await expect(reopenedCard.locator(".knowledge-card__title")).toHaveText(title!);
  await expect(reopenedCard.locator(".knowledge-card__chips")).toHaveText(context!);
  await expectNoCanvasError(page);
});
