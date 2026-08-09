import { expect, test, type Page } from "@playwright/test";

/**
 * Task-2 acceptance gate: the Places globe renders and the walk draws with
 * ZERO external network requests. Only localhost origins (the Vite dev server
 * on 4173 and the terminal bridge on 4789) may be contacted — nothing leaves
 * the machine. The flat map is the detail view reachable from the globe, with
 * one action returning to the globe.
 *
 * Unlike the earlier vacuous pass, this spec PROVES the map rendered before
 * trusting the network audit: WebGL2 is forced on in playwright.config.ts, the
 * MapLibre error element must be absent, the map canvas must exist with
 * non-zero size, and a camera flight must change the rendered pixels (a blank
 * canvas is byte-identical before/after; a painted globe is not).
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

/** Screenshot just the map element (the WebGL canvas region). */
async function screenshotMap(page: Page): Promise<Buffer> {
  const map = page.getByTestId("psychogeographic-map");
  await map.scrollIntoViewIfNeeded();
  const box = await map.boundingBox();
  if (!box || box.width < 16 || box.height < 16) {
    throw new Error("map element has no measurable bounding box");
  }
  return page.screenshot({
    clip: { x: box.x, y: box.y, width: box.width, height: box.height },
  });
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

  // RENDER PROOF 1: the MapLibre map initialized without an error banner.
  await expect(page.getByTestId("psychogeographic-error")).toHaveCount(0, {
    timeout: 15_000,
  });

  // RENDER PROOF 2: a WebGL canvas exists and is non-zero-sized.
  const surface = page.getByTestId("psychogeographic-surface");
  const map = page.getByTestId("psychogeographic-map");
  await expect(map.locator("canvas").first()).toBeVisible();
  const canvasSize = await map.locator("canvas").first().evaluate(
    (canvas) => ({ width: canvas.width, height: canvas.height }),
  );
  expect(canvasSize.width).toBeGreaterThan(0);
  expect(canvasSize.height).toBeGreaterThan(0);

  // Let the globe settle before the pixel proof.
  await page.waitForTimeout(1000);

  // Offline gate part 1: zero external requests during globe render + walk draw.
  expect(external).toEqual([]);

  // RENDER PROOF 3: flying to a different place changes the rendered pixels.
  // A blank/never-painted canvas is byte-identical across a flight; a painted
  // globe rotates and therefore differs.
  const before = await screenshotMap(page);
  const initialCenter = await map.getAttribute("data-center");
  await page.getByTestId("places-fly-next").click();
  await expect(surface).toHaveAttribute("data-view", "globe");
  // Wait for the flight's `moveend` to surface a new center.
  await expect(map).not.toHaveAttribute("data-center", initialCenter, {
    timeout: 10_000,
  });
  await page.waitForTimeout(500);
  const after = await screenshotMap(page);
  expect(before.equals(after)).toBe(false);
  expect(external).toEqual([]);

  // Clicking a located place/walk stop descends into the flat detail map.
  const locatedStop = page
    .locator("[data-testid^='psychogeographic-stop-'][data-located='true']")
    .first();
  await locatedStop.click();
  await expect(surface).toHaveAttribute("data-view", "flat");
  await expect(page.getByTestId("places-view-label")).toHaveText("Flat detail");
  await expect(page.getByTestId("places-back-to-globe")).toBeVisible();
  // The map keeps rendering through the descent (no error).
  await expect(page.getByTestId("psychogeographic-error")).toHaveCount(0);

  // One action returns to the globe.
  await page.getByTestId("places-back-to-globe").click();
  await expect(surface).toHaveAttribute("data-view", "globe");
  await expect(page.getByTestId("psychogeographic-error")).toHaveCount(0);

  // Still fully offline after flight, descent, and return.
  expect(external).toEqual([]);
});
