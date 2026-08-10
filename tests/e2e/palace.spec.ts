import { expect, test, type Page } from "@playwright/test";

/**
 * Task-7 acceptance gate: the 3D mind palace renders from a REAL graph, fully
 * offline. Rooms are chamber clusters, members are placeable objects on the
 * walls/floor, each chamber hosts a real constellation object, collections
 * derive from graph structure, and the first-person camera flies between
 * chambers. WebGL2 is forced on in playwright.config.ts (SwiftShader), the
 * error element must be absent, the WebGL canvas must exist with non-zero size,
 * and a camera flight must change the rendered pixels (a blank canvas is
 * byte-identical before/after; a painted palace is not). The hostname-filtered
 * network audit runs before AND after the interaction — nothing leaves the
 * machine.
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

/** Screenshot just the palace viewport (the WebGL canvas region). */
async function screenshotPalace(page: Page): Promise<Buffer> {
  const viewport = page.getByTestId("palace-canvas");
  await viewport.scrollIntoViewIfNeeded();
  const box = await viewport.boundingBox();
  if (!box || box.width < 16 || box.height < 16) {
    throw new Error("palace canvas has no measurable bounding box");
  }
  return page.screenshot({
    clip: { x: box.x, y: box.y, width: box.width, height: box.height },
  });
}

test("3D palace renders from the real graph, flies between chambers, fully offline", async ({
  page,
}) => {
  const external = await collectExternalRequests(page);

  await page.goto("/");
  await page.getByTestId("lens-palace").click();

  // The palace host boots with the real graph.
  await expect(page.getByTestId("palace-surface")).toBeVisible({ timeout: 20_000 });

  // Real graph produced real chambers (room clustering) and real objects.
  await expect(page.getByTestId("palace-chambers")).toBeVisible();
  await expect(
    page.getByTestId("palace-chambers").locator("li"),
  ).not.toHaveCount(0);
  await expect(page.getByTestId("palace-objects").locator("li")).not.toHaveCount(0);

  // RENDER PROOF 1: the WebGL surface initialized without an error banner.
  await expect(page.getByTestId("palace-error")).toHaveCount(0, {
    timeout: 15_000,
  });

  // RENDER PROOF 2: a real WebGL canvas exists and is non-zero-sized.
  const canvas = page.getByTestId("palace-canvas").locator("canvas").first();
  await expect(canvas).toBeVisible();
  const canvasSize = await canvas.evaluate((element) => ({
    width: (element as HTMLCanvasElement).width,
    height: (element as HTMLCanvasElement).height,
  }));
  expect(canvasSize.width).toBeGreaterThan(0);
  expect(canvasSize.height).toBeGreaterThan(0);

  // A real constellation object hosts the chamber subgraph, and a real
  // collection derives from the chamber's coherent set.
  await expect(
    page.getByTestId("palace-constellations").locator("li"),
  ).not.toHaveCount(0);
  await expect(
    page.getByTestId("palace-collections").locator("li"),
  ).not.toHaveCount(0);

  // The first-person camera is live (the surface exposes the pose each frame).
  await expect(page.getByTestId("palace-surface")).toHaveAttribute(
    "data-camera",
    /^-?\d+\.\d+,-?\d+\.\d+,-?\d+\.\d+$/,
    { timeout: 15_000 },
  );

  // Let the palace settle before the pixel proof.
  await page.waitForTimeout(800);

  // Offline gate part 1: zero external requests during palace render.
  expect(external).toEqual([]);

  // RENDER PROOF 3: flying to a different chamber changes the rendered pixels.
  // A blank/never-painted canvas is byte-identical across a flight; a painted
  // palace moves the camera and therefore differs.
  const before = await screenshotPalace(page);
  const initialCamera = await page
    .getByTestId("palace-surface")
    .getAttribute("data-camera");

  await page.getByTestId("palace-fly-next").click();
  await expect(page.getByTestId("palace-surface")).not.toHaveAttribute(
    "data-camera",
    initialCamera as string,
    { timeout: 10_000 },
  );
  // Wait for the flight's ease to settle.
  await page.waitForTimeout(900);
  const after = await screenshotPalace(page);
  expect(before.equals(after)).toBe(false);
  expect(external).toEqual([]);

  // Guided recall reveals chambers one at a time over the walk order.
  await page.getByTestId("palace-mode-recall").click();
  await expect(page.getByTestId("palace-recall")).toBeVisible();
  await expect(page.getByTestId("palace-reveal-next")).toBeVisible();
  await page.getByTestId("palace-reveal-next").click();
  await expect(page.getByTestId("palace-recall")).toContainText("Revealed 2");
  // Still fully offline after the flight and the recall advance.
  expect(external).toEqual([]);
});
