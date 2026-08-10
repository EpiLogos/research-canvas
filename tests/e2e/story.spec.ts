import { expect, test } from "@playwright/test";

/**
 * Task-5 acceptance gate (issue #21): the story lens renders a seeded journey
 * over located events — the visible label is "Journeys", the seeded journey
 * ("A journey over located events") and its 4 located scenes appear, and no
 * migration-only claim is visible anywhere. The harness boots the real desktop
 * dev server on 4173 with the corpus fixture, so the seed path (timeline view →
 * corpus passage refs → scene store) is exercised for real.
 */
test("story lens renders the seeded journey with no migration-only claims", async ({
  page,
}) => {
  await page.goto("/");

  // The shell labels the story lens "Journeys", never "Story"/migration.
  await expect(page.getByTestId("lens-story")).toHaveText("Journeys");
  await expect(page.getByRole("tab", { name: "Journeys" })).toBeVisible();

  await page.getByTestId("lens-story").click();

  // Seeding is real: the corpus walk assembles and the surface renders.
  await expect(page.getByTestId("story-surface")).toBeVisible({
    timeout: 20_000,
  });

  // The visible narrative is an agnostic journey over located events.
  await expect(
    page.getByRole("heading", { name: "A journey over located events" }),
  ).toBeVisible();

  // The located stops render as the journey's scenes. Scene ids keep the
  // internal `migration:journey:` prefix (data compat) but the surface is
  // ordered and navigable regardless of the exact stops the real graph yields.
  const sceneNav = page.locator("[data-testid^='story-scene-migration:journey:']");
  await expect(sceneNav).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) {
    await expect(sceneNav.nth(index)).toBeVisible();
  }

  // The first scene is the chronologically-first located stop.
  await expect(sceneNav.first()).toContainText(/Rudolf II/i);

  // Media-first scene content: with no captured street-view imagery the
  // surface degrades to a neutral fallback (never an error), and the walk's
  // map context renders as the route diagram.
  await expect(page.getByTestId("story-street-view-fallback")).toBeVisible();
  await expect(page.getByTestId("story-walk-context")).toBeVisible();

  // No migration-only claim is visible anywhere in the story surface.
  const surface = page.getByTestId("story-surface");
  await expect(surface.getByText(/migration/i)).toHaveCount(0);
  await expect(surface.getByText(/From origin to destination/i)).toHaveCount(0);
});
