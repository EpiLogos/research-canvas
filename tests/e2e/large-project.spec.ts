import { expect, test } from "@playwright/test";
import { openFilesBrowserView, waitForWorkspace } from "./support/canvas";

test("indexes the larger vault instead of showing an empty placeholder explorer", async ({
  page
}) => {
  await page.goto("/");
  await waitForWorkspace(page);
  await openFilesBrowserView(page);

  await expect(
    page.locator(".lo-file-row", { hasText: "Report6.md" })
  ).toBeAttached();
  await expect(
    page.locator(".lo-file-row", { hasText: "episode-2-research-timeline.md" })
  ).toBeAttached();
  await expect(
    page.locator(".lo-file-row", { hasText: "episode-1-2-archetypal-resonance.mmd" })
  ).toBeAttached();
});
