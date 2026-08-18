import { expect, test, type Page } from "@playwright/test";

/**
 * T11 acceptance gate: select a real constellation that owns dated historical
 * nodes, then prove Surface #2 renders that earthbound walk and keeps the rich
 * relational timeline behaviour while remaining fully offline.
 */

const MEDICI = "root-archetypal-field:medici-template";

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

test("timeline surface renders the active constellation walk and canonical controls fully offline", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const external = await collectExternalRequests(page);

  await page.goto("/");

  // The compact desktop shell can render before the browser bridge finishes
  // its first dev-mode relink and workspace bootstrap. Open the files surface
  // at the DOM boundary, then wait for profile + constellation state that can
  // only exist after the real project-backed workspace has resolved. A shell
  // pane by itself is not a readiness signal.
  const rail = page.getByTestId("left-rail");
  await rail
    .getByRole("button", { name: "Files & Constellation", exact: true })
    .dispatchEvent("click");
  await expect(page.getByTestId("lo-project-scope-profile")).toBeAttached({ timeout: 35_000 });
  await expect(page.getByTestId("lo-constellations").getByRole("button").first()).toBeAttached({
    timeout: 35_000,
  });

  // Constellation selection is fixture setup for this ticket, not a T11
  // interaction gate, so activate the existing browser control at the DOM
  // boundary. The Timeline interactions below remain real pointer actions.
  const historicalForms = page
    .getByTestId("lo-constellations")
    .getByRole("button", { name: /^Historical Forms\b/ });
  await expect(historicalForms).toBeAttached({ timeout: 15_000 });
  await historicalForms.dispatchEvent("click");
  await expect(historicalForms).toHaveAttribute("data-active", "true", { timeout: 15_000 });

  await page.getByTestId("lens-timeline").click();

  const surface = page.getByTestId("timeline-surface");
  await expect(surface).toBeVisible({ timeout: 20_000 });
  // The shell has four vertical regions (title bar, pipeline rail, Stage,
  // status). Guard the Stage geometry itself so a grid-row regression cannot
  // make a technically mounted Timeline live entirely below the viewport.
  const stageBox = await page.getByTestId("shell-stage").boundingBox();
  const browserViewport = page.viewportSize();
  expect(stageBox).not.toBeNull();
  expect(browserViewport).not.toBeNull();
  expect(stageBox!.height).toBeGreaterThan(300);
  expect(stageBox!.y).toBeLessThan(browserViewport!.height);
  expect(stageBox!.y + stageBox!.height).toBeGreaterThan(0);
  await expect(page.getByTestId("timeline-earthbound-track")).toBeVisible();
  await expect(page.getByTestId("timeline-axis")).toBeVisible();
  await expect(page.getByTestId("timeline-zoom-out")).toBeVisible();
  await expect(page.getByTestId("timeline-zoom-in")).toBeVisible();
  const timelineTrack = page.getByTestId("timeline-track");
  await expect(timelineTrack).toBeVisible();
  await expect(page.getByTestId("timeline-load-error")).toHaveCount(0, {
    timeout: 15_000,
  });

  // The default global camera starts broad enough to include the historical
  // field. Wait for the canonical repository walk to resolve before using Fit:
  // Fit is intentionally disabled while an empty in-memory walk could still
  // mean "loading" rather than "empty constellation".
  const fit = page.getByTestId("timeline-fit");
  await expect(fit).toBeEnabled({ timeout: 15_000 });
  await expect(page.getByTestId(`timeline-node-${MEDICI}`)).toBeAttached({ timeout: 15_000 });

  // Exercise a real zoom from the global overview, then Fit the active
  // constellation. Historical Forms spans more than four millennia, so the
  // mature Timeline correctly returns to its panoramic millennium tier rather
  // than trying to force every stop into a full-size card.
  await page.getByTestId("timeline-zoom-in").click();
  await expect(surface).toBeVisible();
  await fit.click();
  await expect(surface).toBeVisible();

  await expect(page.getByTestId("timeline-walk")).toBeVisible();
  await expect(page.getByTestId("timeline-walk-stops").locator("li")).not.toHaveCount(0);
  expect(external).toEqual([]);

  const mediciNode = page.getByTestId(`timeline-node-${MEDICI}`);
  const mediciMarker = page.getByTestId(`timeline-node-marker-${MEDICI}`);
  await expect(page.getByTestId("timeline-tier")).toHaveText("millennium");
  await expect(mediciNode).toHaveAttribute("data-lod", "marker");
  await expect(mediciMarker).toBeVisible();

  // Semantic zoom is a real Timeline capability, not an acceptance loophole.
  // The wheel contract belongs to the visible Timeline track, while cards may
  // intentionally occupy lanes above/below the browser viewport until the user
  // pans vertically. Preserve Medici's horizontal time anchor, but deliver the
  // gesture to a visible point on the track rather than its possibly off-screen
  // marker box.
  const markerBox = await mediciMarker.boundingBox();
  const trackBox = await timelineTrack.boundingBox();
  expect(markerBox).not.toBeNull();
  expect(trackBox).not.toBeNull();
  const trackLeft = Math.max(0, trackBox!.x);
  const trackRight = Math.min(browserViewport!.width - 1, trackBox!.x + trackBox!.width - 1);
  const trackTop = Math.max(0, trackBox!.y);
  const trackBottom = Math.min(browserViewport!.height - 1, trackBox!.y + trackBox!.height - 1);
  expect(trackRight).toBeGreaterThan(trackLeft);
  expect(trackBottom).toBeGreaterThan(trackTop);
  const mediciAnchorX = markerBox!.x + markerBox!.width / 2;
  await page.mouse.move(
    Math.min(trackRight, Math.max(trackLeft, mediciAnchorX)),
    trackTop + (trackBottom - trackTop) / 2,
  );
  await page.mouse.wheel(0, -600);
  await expect(page.getByTestId("timeline-tier")).toHaveText("century", { timeout: 15_000 });

  const mediciCard = page.getByTestId(`timeline-card-${MEDICI}`);
  const mediciInteractiveCard = page.getByTestId(`timeline-node-card-${MEDICI}`);
  await expect(mediciCard).toBeVisible({ timeout: 15_000 });
  await expect(mediciInteractiveCard).toBeVisible({ timeout: 15_000 });
  await expect(mediciCard).toContainText("Medici Template");
  await expect(mediciNode).toBeAttached();

  // Shift-click is the real timeline-local exploration affordance. Activate
  // the visible card box: its absolute node wrapper is only the year anchor and
  // can itself sit outside the browser viewport while the lane-offset card is
  // visible. The click still bubbles through the node selection contract, while
  // Surface #2 deliberately keeps Shift on Timeline instead of opening Canvas.
  await mediciInteractiveCard.click({ modifiers: ["Shift"] });

  await expect(page.getByTestId("timeline-working-set")).toBeVisible();
  const entry = page.getByTestId(`timeline-working-set-entry-${MEDICI}`);
  await expect(entry).toBeVisible();
  await expect(entry).toHaveAttribute("data-edge-count", /^[1-9]\d*$/);
  await expect(entry).toHaveAttribute("data-neighbour-count", /^[1-9]\d*$/);
  await expect(entry).toContainText("dominant");
  await expect(page.getByTestId("timeline-scene")).toBeVisible();

  const stop = page.getByTestId(`timeline-walk-stop-${MEDICI}`);
  await expect(stop).toHaveAttribute("data-framed", "true");

  await page.getByTestId(`timeline-working-set-unload-${MEDICI}`).click();
  await expect(entry).not.toBeVisible();
  await expect(page.getByTestId("timeline-walk-stops").locator("li")).not.toHaveCount(0);
  expect(external).toEqual([]);

  // Default single activation opens the selected node in the active
  // constellation's Canvas tab. Again use the visible card box so this remains
  // a genuine pointer action rather than forcing an off-screen anchor wrapper.
  await expect(mediciInteractiveCard).toBeVisible({ timeout: 15_000 });
  await mediciInteractiveCard.click();
  await expect(page.getByTestId("canvas-pane")).toBeVisible({ timeout: 5_000 });
  expect(external).toEqual([]);
});