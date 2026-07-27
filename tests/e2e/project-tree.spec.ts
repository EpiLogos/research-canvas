import { expect, test } from "@playwright/test";
import { openFilesBrowserView, waitForWorkspace } from "./support/canvas";

test("shows the root constellation and indexed vault entries in the left rail", async ({
  page
}) => {
  await page.goto("/");
  await waitForWorkspace(page);

  await expect(
    page.locator(".lo-constellation-item", { hasText: "Root Archetypal Field" }),
  ).toBeAttached();
  await openFilesBrowserView(page);
  await expect(
    page.locator(".lo-file-row", { hasText: "episodes" }).first(),
  ).toBeAttached();
  await expect(
    page.locator(".lo-file-row", { hasText: "episode-1-2-archetypal-resonance.md" }),
  ).toBeAttached();
});
