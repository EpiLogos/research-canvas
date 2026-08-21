import { expect, test, type Page } from "@playwright/test";

async function selectHistoricalForms(page: Page): Promise<void> {
  const rail = page.getByTestId("left-rail");
  const filesButton = rail.getByRole("button", { name: "Files & Constellation", exact: true });
  await filesButton.dispatchEvent("click");
  await expect(page.getByTestId("lo-project-scope-profile")).toBeAttached({ timeout: 35_000 });
  const constellations = page.getByTestId("lo-constellations");
  await expect(constellations.getByRole("button").first()).toBeAttached({ timeout: 35_000 });
  const historicalForms = constellations.getByRole("button", { name: /^Historical Forms\b/ });
  await expect(historicalForms).toBeAttached({ timeout: 15_000 });
  await historicalForms.dispatchEvent("click");
  await expect(historicalForms).toHaveAttribute("data-active", "true", { timeout: 15_000 });

  // Selecting a constellation intentionally leaves the browser panel open.
  // Close it through the real rail toggle before exercising the main stage so
  // Story authoring is tested with the same shell geometry a user sees.
  await filesButton.click();
  await expect(page.getByTestId("shell-left-sidebar")).toHaveAttribute("data-open", "false");
}

async function addScene(
  page: Page,
  title: string,
  narration: string,
  transition: "fade" | "dissolve",
): Promise<void> {
  await page.getByTestId("story-add-scene").click();
  await expect(page.getByTestId("story-scene-editor")).toBeVisible();
  await page.getByTestId("story-scene-title").fill(title);
  await page.getByTestId("story-scene-narration").fill(narration);
  await page.getByTestId("story-scene-transition").selectOption(transition);
  await page.getByTestId("story-scene-duration").fill("1000");
  const firstNode = page.getByTestId("story-scene-node-select").getByRole("checkbox").first();
  if (await firstNode.count()) await firstNode.check();
  await page.getByTestId("story-scene-save").click();
  await expect(page.getByTestId("story-scene-editor")).toHaveCount(0, { timeout: 15_000 });
}

test("Story creates and persists a two-scene journey and previews its transition", async ({ page }) => {
  test.setTimeout(90_000);
  const journeyTitle = `T13 browser journey ${Date.now()}`;

  await page.goto("/");
  await selectHistoricalForms(page);
  await page.getByTestId("lens-story").click();
  await expect(page.getByTestId("story-lens")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("story-compose-mode")).toHaveAttribute("data-active", "true");
  await expect(page.getByTestId("story-surface")).toBeVisible();

  await page.getByTestId("story-new-journey-title").fill(journeyTitle);
  await page.getByTestId("story-create-journey").click();
  const journeyButton = page
    .getByTestId("story-journey-list")
    .getByRole("button", { name: new RegExp(journeyTitle) });
  await expect(journeyButton).toBeVisible({ timeout: 15_000 });

  await addScene(page, "Arrival", "The first authored scene.", "fade");
  await addScene(page, "Aftermath", "The second authored scene.", "dissolve");

  const strip = page.getByTestId("story-scene-strip");
  await expect(strip.getByRole("button", { name: /Arrival/ })).toBeVisible();
  await expect(strip.getByRole("button", { name: /Aftermath/ })).toBeVisible();

  await page.getByTestId("story-preview").click();
  const previewScene = page.getByTestId("story-preview-scene");
  await expect(previewScene).toContainText("Arrival");
  await expect(previewScene).toContainText("The first authored scene.");
  await expect(previewScene).toHaveAttribute("data-transition", "fade");
  await expect(previewScene).toContainText("Aftermath", { timeout: 4_000 });
  await expect(previewScene).toHaveAttribute("data-transition", "dissolve");
  await page.getByTestId("story-preview-close").click();

  // A reload must reconstruct the authored journey from the real SQLite scene
  // store rather than component memory or an auto-created seed journey.
  await page.reload();
  await selectHistoricalForms(page);
  await page.getByTestId("lens-story").click();
  await expect(page.getByTestId("story-lens")).toBeVisible({ timeout: 20_000 });
  const reloadedJourney = page
    .getByTestId("story-journey-list")
    .getByRole("button", { name: new RegExp(journeyTitle) });
  await expect(reloadedJourney).toBeVisible({ timeout: 15_000 });
  await reloadedJourney.click();
  const reloadedStrip = page.getByTestId("story-scene-strip");
  await expect(reloadedStrip.getByRole("button", { name: /Arrival/ })).toBeVisible();
  await expect(reloadedStrip.getByRole("button", { name: /Aftermath/ })).toBeVisible();
});
