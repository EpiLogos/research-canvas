import { expect, test } from "@playwright/test";
import { openProjectsBrowserView, waitForWorkspace } from "./support/canvas";

test("shows the project tree and opens a constellation in a canvas tab", async ({
  page,
}) => {
  await page.goto("/");
  await waitForWorkspace(page);

  await openProjectsBrowserView(page);

  await expect(page.getByTestId("project-root-picker")).toHaveText(
    "Open project root…",
  );

  const rootConstellation = page.locator("[data-testid^='constellation-node-']", {
    hasText: "Root Archetypal Field",
  });
  await expect(rootConstellation).toBeAttached();
  await rootConstellation.dispatchEvent("click");

  const globalTab = page.getByTestId("app-tabbar").getByRole("tab", {
    name: "Root Archetypal Field",
  });
  await expect(globalTab).toBeVisible();
  await expect(globalTab).toHaveAttribute("aria-selected", "true");
});
