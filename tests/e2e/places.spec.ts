import { expect, test, type Page } from "@playwright/test";

/**
 * Task-2 acceptance gate: the Places globe renders and the walk draws with
 * ZERO external network requests. Only localhost origins (the Vite dev server
 * on 4173 and the terminal bridge on 4789) may be contacted — nothing leaves
 * the machine. The flat map is the detail view reachable from the globe, with
 * one action returning to the globe.
 */

async function collectExternalRequests(page: Page): Promise<string[]> {
  const external: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
      external.push(request.url());
    }
  });
  return external;
}

test("Places globe renders a walk fully offline and descends into the flat detail view", async ({
  page,
}) => {
  const external = await collectExternalRequests(page);

  await page.goto("/");
  await page.getByTestId("lens-psychogeographic").click();

  // The globe is the default surface.
  await expect(page.getByTestId("psychogeographic-surface")).toHaveAttribute(
    "data-view",
    "globe",
  );
  await expect(page.getByTestId("places-view-label")).toHaveText("Globe");

  // A real corpus walk assembles and draws as great-circle arcs.
  await expect(page.getByTestId("psychogeographic-stops")).toBeVisible();
  await expect(
    page.getByTestId("psychogeographic-stops").locator("li"),
  ).not.toHaveCount(0);

  // Let the map settle and the walk draw before auditing the network.
  await page.waitForTimeout(1200);

  // Offline gate: zero external requests during globe render + walk draw.
  expect(external).toEqual([]);

  // Place-to-place camera flight stays on the globe.
  await page.getByTestId("places-fly-next").click();
  await expect(page.getByTestId("psychogeographic-surface")).toHaveAttribute(
    "data-view",
    "globe",
  );

  // Clicking a located place/walk stop descends into the flat detail map.
  const locatedStop = page
    .locator("[data-testid^='psychogeographic-stop-'][data-located='true']")
    .first();
  await locatedStop.click();
  await expect(page.getByTestId("psychogeographic-surface")).toHaveAttribute(
    "data-view",
    "flat",
  );
  await expect(page.getByTestId("places-view-label")).toHaveText("Flat detail");
  await expect(page.getByTestId("places-back-to-globe")).toBeVisible();

  // One action returns to the globe.
  await page.getByTestId("places-back-to-globe").click();
  await expect(page.getByTestId("psychogeographic-surface")).toHaveAttribute(
    "data-view",
    "globe",
  );

  // Still fully offline after flight, descent, and return.
  expect(external).toEqual([]);
});
