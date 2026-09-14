import { expect, test } from "@playwright/test";

const BANDA_GRAPH_NODE_ID = "root-archetypal-field:banda-genocide";

/**
 * T12 browser gate: mutate one existing canonical seed node through the normal
 * local metadata command so it carries a TemporalPlace, then prove the Places
 * surface discovers it through the project-wide SQLite read and renders a real
 * interactive MapLibre globe marker. No walk/scene fixture participates.
 */
test("Places globe reads project geography, switches projection, opts into live tiles, and opens location context", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("lo-project-scope-profile")).toBeVisible({ timeout: 15_000 });

  const updated = await page.evaluate(async ({ graphNodeId }) => {
    const sessionId = document.cookie
      .split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith("research_canvas_session_id="))
      ?.slice("research_canvas_session_id=".length);
    if (!sessionId) throw new Error("research-canvas browser session cookie was not established");

    const response = await fetch("http://127.0.0.1:4789/graph/node/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Research-Canvas-Session": sessionId,
      },
      body: JSON.stringify({
        graphNodeId,
        patch: {
          placeCoverage: "resolved",
          place: {
            graphNodeId,
            names: [{ language: "en", name: "Banda Islands" }],
            coordinate: {
              precision: "approximate",
              latitude: -4.55,
              longitude: 129.9,
            },
            hierarchy: [],
            externalRefs: [],
            provenance: { sourceRefs: [] },
          },
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`local Place update failed (${response.status}): ${await response.text()}`);
    }
    return response.json() as Promise<{ graphNodeId: string; title: string }>;
  }, { graphNodeId: BANDA_GRAPH_NODE_ID });

  expect(updated.graphNodeId).toBe(BANDA_GRAPH_NODE_ID);

  await page.getByTestId("lens-psychogeographic").click();
  const globe = page.getByTestId("places-globe");
  await expect(globe).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("psychogeographic-error")).toHaveCount(0);

  // A real MapLibre WebGL surface is alive, not a static placeholder.
  const canvas = globe.locator("canvas").first();
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  const dimensions = await canvas.evaluate((element) => ({
    width: element.width,
    height: element.height,
  }));
  expect(dimensions.width).toBeGreaterThan(0);
  expect(dimensions.height).toBeGreaterThan(0);

  const marker = page.getByTestId(`globe-marker-${BANDA_GRAPH_NODE_ID}`);
  await expect(marker).toBeVisible({ timeout: 20_000 });

  // Explicit projection controls replace the old hard-coded next-stop travel.
  await expect(page.getByTestId("places-fly-next")).toHaveCount(0);
  await expect(page.getByTestId("psychogeographic-stops")).toHaveCount(0);
  await page.getByTestId("places-flat-toggle").click();
  await expect(page.getByTestId("places-flat-map")).toBeVisible();
  await page.getByTestId("places-globe-toggle").click();
  await expect(page.getByTestId("places-globe")).toBeVisible();

  // Live tile use is opt-in: enabling it exposes the explicit refresh action
  // but does not itself emit a network request.
  await expect(page.getByTestId("places-connection-status")).toHaveText("Offline");
  await page.getByTestId("psychogeographic-opt-in-live").click();
  await expect(page.getByTestId("psychogeographic-refresh-tiles")).toBeVisible();

  await marker.click();
  const panel = page.getByTestId("places-location-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(updated.title);
  await expect(page.getByTestId("place-coordinates")).toContainText("-4.55000, 129.90000");
  await expect(page.getByTestId("place-precision")).toHaveText("approximate");
  await expect(page.getByTestId("place-height")).toHaveCount(0);
  await expect(panel).toContainText("Related nodes");
  await expect(panel).toContainText("Archetypal expressions");

  // Double-click uses the shared Canvas-opening seam rather than a Places-only
  // reader/session system.
  await marker.dblclick();
  await expect(page.getByTestId("canvas-pane")).toBeVisible({ timeout: 10_000 });
});
