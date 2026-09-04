import { expect, test, type Page } from "@playwright/test";

/**
 * Task-3 acceptance gate: movement-stream lanes (ticket #19) render on the
 * Places globe with corpus passage provenance, still with ZERO external
 * network requests. The lens seeds real lanes from the corpus (VOC
 * Amsterdam→Banda, Rhodes's Oxford↔Kimberley, Rudolf II Vienna→Prague, Cult of
 * Reason Paris loop) on first load; the seed is idempotent per
 * (profileScope, seedKey), so re-runs read what is already persisted. This
 * spec PROVES the lanes actually rendered (a real WebGL map, lane buttons in
 * the DOM, and a provenance panel with the real corpus artifactId), that the
 * temporal filter changes which lanes are visible, and that the render is
 * fully offline.
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

test("seeded movement lanes render on the globe, filter temporally, and drill into provenance — fully offline", async ({
  page,
}) => {
  const external = await collectExternalRequests(page);

  await page.goto("/");
  await page.getByTestId("lens-psychogeographic").click();

  // The globe is the default surface. A fresh browser session seeds a fresh
  // workspace DB, so the first run pays for migration + root-seed + lane-seed
  // + WebGL init under load — allow the surface to appear comfortably.
  await expect(page.getByTestId("psychogeographic-surface")).toHaveAttribute(
    "data-view",
    "globe",
    { timeout: 20_000 },
  );

  // RENDER PROOF 1: the MapLibre map initialized without an error banner.
  await expect(page.getByTestId("psychogeographic-error")).toHaveCount(0, {
    timeout: 15_000,
  });

  // RENDER PROOF 2: a WebGL canvas exists and is non-zero-sized.
  const map = page.getByTestId("psychogeographic-map");
  await expect(map.locator("canvas").first()).toBeVisible();
  const canvasSize = await map.locator("canvas").first().evaluate(
    (canvas) => ({ width: canvas.width, height: canvas.height }),
  );
  expect(canvasSize.width).toBeGreaterThan(0);
  expect(canvasSize.height).toBeGreaterThan(0);

  // The corpus-seeded movement lanes appear. The seed runs once on a fresh
  // profile and reads real corpus passages; on a re-run it reads persisted
  // lanes, so either path lands here with the same lanes.
  await expect(
    page.getByTestId("geography-lane-voc:amsterdam-to-banda"),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByTestId("geography-lane-rhodes:oxford-to-kimberley"),
  ).toBeVisible();
  await expect(
    page.getByTestId("geography-lane-rudolf-ii:vienna-to-prague"),
  ).toBeVisible();
  await expect(
    page.getByTestId("geography-lane-cult-of-reason:paris-loop"),
  ).toBeVisible();

  // Offline gate: nothing leaves the machine during globe render + seeding.
  expect(external).toEqual([]);

  // Clicking a lane opens its provenance panel with the real corpus passage
  // ref (artifactId + character span), not a synthetic one.
  await page.getByTestId("geography-lane-voc:amsterdam-to-banda").click();
  const provenance = page.getByTestId("lane-provenance");
  await expect(provenance).toBeVisible();
  await expect(provenance).toContainText("VOC shipping lane Amsterdam → Banda");
  await expect(provenance).toContainText("shipping");
  await expect(provenance).toContainText("Report8.md");
  await expect(provenance).toContainText("chars");
  expect(external).toEqual([]);

  // Temporal filter: pin the year to 1602 — the VOC lane is active, but
  // Rhodes's 1873 lane is not.
  const filter = page.getByTestId("lane-year-filter");
  await filter.fill("1602");
  await expect(page.getByTestId("lane-year-value")).toHaveText("1602");
  await expect(
    page.getByTestId("geography-lane-voc:amsterdam-to-banda"),
  ).toBeVisible();
  await expect(
    page.getByTestId("geography-lane-rhodes:oxford-to-kimberley"),
  ).not.toBeVisible();
  expect(external).toEqual([]);

  // Clearing the filter restores every lane.
  await page.getByTestId("lane-year-clear").click();
  await expect(page.getByTestId("lane-year-value")).toHaveText("all");
  await expect(
    page.getByTestId("geography-lane-rhodes:oxford-to-kimberley"),
  ).toBeVisible();

  // Still fully offline after seeding, provenance drill-down, and filtering.
  expect(external).toEqual([]);
});
