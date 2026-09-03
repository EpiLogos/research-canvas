import { expect, test, type Locator, type Page } from "@playwright/test";
import { awaitCanvasReady } from "./support/canvas";
import { waitForSeededGraphReady } from "./helpers/project";

const ROOT_PROJECT_NAME = "Root Archetypal Field";
const HISTORICAL_FORMS = "Historical Forms";
const CHRIST = "root-archetypal-field:christ-sixfold-lineage";
const MEDICI = "root-archetypal-field:medici-template";
const VOC = "root-archetypal-field:voc-eic-corpora";
const BANDA = "root-archetypal-field:banda-genocide";

function externalRequestCollector(page: Page): string[] {
  const external: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
      external.push(request.url());
    }
  });
  return external;
}

function errorCollector(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

async function openFiles(page: Page): Promise<void> {
  const sidebar = page.getByTestId("shell-left-sidebar");
  const files = page
    .getByTestId("left-rail")
    .getByRole("button", { name: "Files & Constellation", exact: true });
  if (await sidebar.getAttribute("data-open") !== "true") {
    await files.dispatchEvent("click");
  }
  await expect(page.getByTestId("lo-project-scope-profile")).toBeAttached({ timeout: 35_000 });
}

async function closeLeftSidebar(page: Page): Promise<void> {
  const sidebar = page.getByTestId("shell-left-sidebar");
  if (await sidebar.getAttribute("data-open") !== "true") return;
  const active = page.getByTestId("left-rail").locator('button[data-active="true"]').first();
  if (await active.count()) {
    await active.click();
    await expect(sidebar).toHaveAttribute("data-open", "false");
  }
}

async function selectHistoricalForms(page: Page): Promise<void> {
  await openFiles(page);
  const constellations = page.getByTestId("lo-constellations");
  await expect(constellations.getByRole("button").first()).toBeAttached({ timeout: 35_000 });
  const historical = constellations.getByRole("button", { name: new RegExp(`^${HISTORICAL_FORMS}\\b`) });
  await expect(historical).toBeAttached({ timeout: 15_000 });
  await historical.dispatchEvent("click");
  await expect(historical).toHaveAttribute("data-active", "true", { timeout: 15_000 });
  await closeLeftSidebar(page);
}

async function attachCanonicalBandaPlace(page: Page): Promise<void> {
  await page.evaluate(async ({ graphNodeId }) => {
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
  }, { graphNodeId: BANDA });
}

async function addStoryScene(
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

async function tabItem(page: Page, surface: string, title?: string): Promise<Locator> {
  const items = page.getByTestId("app-tabbar").locator(".app-tabbar__item");
  let item = items.filter({ has: page.locator(".app-tabbar__surface", { hasText: surface }) });
  if (title) item = item.filter({ has: page.locator(".app-tabbar__label", { hasText: title }) });
  return item.first();
}

async function activateSurfaceTab(page: Page, surface: string, title?: string): Promise<void> {
  const item = await tabItem(page, surface, title);
  await expect(item).toBeVisible({ timeout: 15_000 });
  await item.getByRole("tab").click();
  await expect(item).toHaveAttribute("data-active", "true");
}

async function tabSnapshot(page: Page): Promise<string[]> {
  return page.getByTestId("app-tabbar").locator(".app-tabbar__item").evaluateAll((items) =>
    items.map((item) => {
      const surface = item.querySelector(".app-tabbar__surface")?.textContent?.trim() ?? "";
      const label = item.querySelector(".app-tabbar__label")?.textContent?.trim() ?? "";
      return `${surface}|${label}`;
    }),
  );
}

test("a non-default project remains the active project after restart", async ({ page }) => {
  test.setTimeout(90_000);
  const external = externalRequestCollector(page);
  const errors = errorCollector(page);
  const projectName = "T17 Restart Project";

  await page.goto("/");
  await expect(page.getByTestId("canvas-pane")).toBeVisible({ timeout: 20_000 });
  await openFiles(page);
  await expect(page.getByTestId("lo-project-scope-name")).toContainText(ROOT_PROJECT_NAME);

  await page.getByTestId("projects-trigger").dispatchEvent("click");
  await expect(page.getByTestId("projects-layer")).toBeVisible();
  await page.getByTestId("projects-new-name").fill(projectName);
  await page.getByTestId("projects-create").dispatchEvent("click");
  await expect(page.getByTestId("projects-layer")).not.toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("lo-project-scope-name")).toContainText(projectName, { timeout: 15_000 });
  await expect(page.getByTestId("lo-project-scope-profile")).toContainText("project:t17-restart-project");

  await page.reload();
  await openFiles(page);
  await expect(page.getByTestId("lo-project-scope-name")).toContainText(projectName, { timeout: 20_000 });
  await expect(page.getByTestId("lo-project-scope-profile")).toContainText("project:t17-restart-project");

  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test("full project journey restores tabs, active surface and persisted surface state", async ({ page }) => {
  test.setTimeout(180_000);
  const external = externalRequestCollector(page);
  const errors = errorCollector(page);
  const journeyTitle = `T17 integrated journey ${Date.now()}`;

  await awaitCanvasReady(page);
  await waitForSeededGraphReady(page);
  await closeLeftSidebar(page);

  // Surface #1 · Canvas: prove the canonical spectral lineage is repository-backed,
  // then author a real note + image and connect them through the editor.
  await expect(page.locator(".canvas-flow")).toContainText("Christ Sixfold Spectral Lineage", {
    timeout: 20_000,
  });
  await expect(page.locator(`[data-testid="canvas-node-${CHRIST}"]`)).toBeAttached({ timeout: 20_000 });
  const pane = page.getByTestId("canvas-pane");
  await pane.click({ button: "right", position: { x: 340, y: 230 } });
  await page.getByTestId("context-add-note").click();
  const note = page.locator('.react-flow__node[data-node-type="note"]').last();
  await expect(note).toBeVisible();

  const dataTransfer = await page.evaluateHandle(() => {
    const dt = new DataTransfer();
    dt.setData("text/uri-list", "file:///tmp/research-canvas-e2e/dropped-image.png");
    dt.setData("text/plain", "/tmp/research-canvas-e2e/dropped-image.png");
    return dt;
  });
  await pane.dispatchEvent("drop", { dataTransfer });
  const image = page.locator('.react-flow__node[data-node-type="image"]').last();
  await expect(image).toBeVisible({ timeout: 15_000 });

  const noteTestId = await note.getAttribute("data-testid");
  const imageTestId = await image.getAttribute("data-testid");
  expect(noteTestId).toBeTruthy();
  expect(imageTestId).toBeTruthy();
  const noteId = noteTestId!.replace("canvas-node-", "");
  const imageId = imageTestId!.replace("canvas-node-", "");
  const source = page.locator(`[data-nodeid="${noteId}"][data-handlepos="right"]`).first();
  const target = page.locator(`[data-nodeid="${imageId}"][data-handlepos="left"]`).first();
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".react-flow__edge")).not.toHaveCount(0);

  // Work on the real historical constellation for the mature relational surfaces.
  await selectHistoricalForms(page);

  // Surface #2 · Timeline: enter via the real keyboard command palette, then
  // persist a genuine semantic camera tier + selected graph node. Both Medici
  // and VOC are canonical repository records in this historical constellation.
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  await palette.getByRole("textbox", { name: "Search workspace" }).fill("Go to Timeline");
  const timelineCommand = palette.getByRole("button", { name: "Go to Timeline command" });
  await expect(timelineCommand).toBeVisible();
  await timelineCommand.click();
  await expect(palette).toHaveCount(0);
  await expect(page.getByTestId("timeline-surface")).toBeVisible({ timeout: 20_000 });
  const fit = page.getByTestId("timeline-fit");
  await expect(fit).toBeEnabled({ timeout: 15_000 });
  await expect(page.getByTestId(`timeline-node-${MEDICI}`)).toBeAttached({ timeout: 15_000 });
  await expect(page.getByTestId(`timeline-node-${VOC}`)).toBeAttached({ timeout: 15_000 });
  await fit.click();
  const track = page.getByTestId("timeline-track");
  const trackBox = await track.boundingBox();
  expect(trackBox).not.toBeNull();
  await page.mouse.move(trackBox!.x + trackBox!.width / 2, trackBox!.y + trackBox!.height / 2);
  await page.mouse.wheel(0, -600);
  await expect(page.getByTestId("timeline-tier")).toHaveText("century", { timeout: 15_000 });
  const mediciCard = page.getByTestId(`timeline-node-card-${MEDICI}`);
  await expect(mediciCard).toBeVisible({ timeout: 15_000 });
  await mediciCard.click({ modifiers: ["Shift"] });
  await expect(page.getByTestId(`timeline-working-set-entry-${MEDICI}`)).toBeVisible();

  // Surface #3 · Places: reuse the mature T12/T16 path. Enrich the existing
  // Banda genocide graph node through the ordinary local metadata command,
  // then select that same repository record on the real MapLibre globe.
  await attachCanonicalBandaPlace(page);
  await page.getByTestId("lens-psychogeographic").click();
  const globe = page.getByTestId("places-globe");
  await expect(globe).toBeVisible({ timeout: 25_000 });
  const optIn = page.getByTestId("psychogeographic-opt-in-live");
  if (await optIn.count()) await optIn.click();
  const banda = page.getByTestId(`globe-marker-${BANDA}`);
  await expect(banda).toBeVisible({ timeout: 25_000 });
  await banda.click();
  await expect(page.getByTestId("places-location-panel")).toContainText("Banda Genocide");
  await expect(page.getByTestId("place-coordinates")).toContainText("-4.55000, 129.90000");
  await expect.poll(async () => globe.getAttribute("data-center")).not.toBe("0.0000,20.0000");
  const placesCenter = await globe.getAttribute("data-center");
  expect(placesCenter).toBeTruthy();

  // Surface #4 · Story: author a durable two-scene journey.
  await page.getByTestId("lens-story").click();
  await expect(page.getByTestId("story-surface")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("story-new-journey-title").fill(journeyTitle);
  await page.getByTestId("story-create-journey").click();
  await expect(page.getByTestId("story-journey-list").getByRole("button", { name: new RegExp(journeyTitle) })).toBeVisible({ timeout: 15_000 });
  await addStoryScene(page, "Arrival", "The first integrated scene.", "fade");
  await addStoryScene(page, "Aftermath", "The second integrated scene.", "dissolve");
  await expect(page.getByTestId("story-scene-strip").locator('button[data-testid^="story-scene-"]')).toHaveCount(2);

  // Surface #5 · Palace: regenerate/adopt the mature palace, add a durable room and wall object.
  await page.getByTestId("lens-palace").click();
  await expect(page.getByTestId("palace-surface")).toBeVisible({ timeout: 25_000 });
  const rooms = page.getByTestId("palace-rooms-panel").locator("li");
  const generatedRoomCount = await rooms.count();
  expect(generatedRoomCount).toBeGreaterThan(1);
  await page.getByTestId("palace-generate").click();
  await page.getByTestId("palace-add-room").click();
  await expect(rooms).toHaveCount(generatedRoomCount + 1);
  const manualRoomTestId = await rooms.last().getAttribute("data-testid");
  expect(manualRoomTestId).toBeTruthy();
  const manualRoomId = manualRoomTestId!.replace("palace-room-", "");
  await page.getByTestId("palace-place-object").click();
  await page.getByTestId("palace-place-room").selectOption(manualRoomId);
  await page.getByTestId("palace-wall-face-east").click();
  await page.getByTestId("palace-place-confirm").click();
  await expect(page.locator('[data-testid^="palace-wall-object-manual:object:"]')).toHaveCount(1);

  const tabsBeforeRestart = await tabSnapshot(page);
  const palaceTabBefore = await tabItem(page, "Palace");
  await expect(palaceTabBefore).toHaveAttribute("data-active", "true");

  // Restart boundary: no post-reload navigation is allowed before proving that
  // the active Palace tab and its domain state came back from SQLite.
  await page.reload();
  await expect(page.getByTestId("palace-surface")).toBeVisible({ timeout: 35_000 });
  await expect(page.getByTestId(`palace-room-${manualRoomId}`)).toBeVisible();
  await expect(page.locator('[data-testid^="palace-wall-object-manual:object:"]')).toHaveCount(1);
  const tabsAfterRestart = await tabSnapshot(page);
  expect(tabsAfterRestart).toEqual(tabsBeforeRestart);
  const palaceTabAfter = await tabItem(page, "Palace");
  await expect(palaceTabAfter).toHaveAttribute("data-active", "true");

  await activateSurfaceTab(page, "Story");
  const restoredJourney = page.getByTestId("story-journey-list").getByRole("button", { name: new RegExp(journeyTitle) });
  await expect(restoredJourney).toBeVisible({ timeout: 20_000 });
  await restoredJourney.click();
  await expect(page.getByTestId("story-scene-strip").locator('button[data-testid^="story-scene-"]')).toHaveCount(2);

  await activateSurfaceTab(page, "Places");
  const restoredGlobe = page.getByTestId("places-globe");
  await expect(restoredGlobe).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId("places-location-panel")).toContainText("Banda Genocide", { timeout: 20_000 });
  await expect(page.getByTestId("place-coordinates")).toContainText("-4.55000, 129.90000");
  await expect.poll(async () => restoredGlobe.getAttribute("data-center")).toBe(placesCenter);

  await activateSurfaceTab(page, "Timeline");
  await expect(page.getByTestId("timeline-surface")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("timeline-tier")).toHaveText("century", { timeout: 20_000 });

  await activateSurfaceTab(page, "Canvas", ROOT_PROJECT_NAME);
  await expect(page.getByTestId(noteTestId!)).toBeAttached({ timeout: 20_000 });
  await expect(page.getByTestId(imageTestId!)).toBeAttached({ timeout: 20_000 });
  await expect(page.locator(".react-flow__edge")).not.toHaveCount(0);

  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
