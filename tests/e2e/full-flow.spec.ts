import { expect, test, type Locator, type Page } from "@playwright/test";
import { waitForSeededGraphReady } from "./helpers/project";

const ROOT_PROJECT_NAME = "Root Archetypal Field";
const HISTORICAL_FORMS = "Historical Forms";
const MEDICI = "root-archetypal-field:medici-template";
const VOC = "root-archetypal-field:voc-eic-corpora";
const BANDA = "root-archetypal-field:banda-genocide";

function externalRequestCollector(page: Page): string[] {
  const external: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") external.push(request.url());
  });
  return external;
}

function errorCollector(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`response: ${response.status()} ${new URL(response.url()).pathname}`);
  });
  // #46 requires zero errors, including browser-generated resource errors.
  // Offline operation must succeed through a real local contract; no endpoint
  // or HTTP status is exempted from this acceptance boundary.
  return errors;
}

async function openFiles(page: Page): Promise<void> {
  const sidebar = page.getByTestId("shell-left-sidebar");
  const files = page.getByTestId("left-rail").getByRole("button", { name: "Files & Constellation", exact: true });
  if (await sidebar.getAttribute("data-open") !== "true") await files.dispatchEvent("click");
  // `bootstrapping` is a legitimate Root profile, not a readiness sentinel.
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

async function expectWorkspace(page: Page, name: string, profileScope?: string): Promise<void> {
  await openFiles(page);
  await expect(page.getByTestId("lo-project-scope-name")).toContainText(name, { timeout: 35_000 });
  if (profileScope) await expect(page.getByTestId("lo-project-scope-profile")).toContainText(profileScope);
  await closeLeftSidebar(page);
}

async function selectRootProject(page: Page): Promise<void> {
  // Root's vault lives outside the home-owned Projects picker.
  await expectWorkspace(page, ROOT_PROJECT_NAME, "bootstrapping");
}

async function selectHistoricalForms(page: Page): Promise<{ projectId: string; profileScope: string }> {
  await openFiles(page);
  const constellations = page.getByTestId("lo-constellations");
  await expect(constellations.getByRole("button").first()).toBeAttached({ timeout: 35_000 });
  const historical = constellations.getByRole("button", { name: new RegExp(`^${HISTORICAL_FORMS}\\b`) });
  await expect(historical).toBeAttached({ timeout: 15_000 });
  const selectionResponse = page.waitForResponse((response) =>
    response.request().method() === "POST" && new URL(response.url()).pathname === "/workspace/project",
  );
  await historical.dispatchEvent("click");
  const selected = await selectionResponse;
  expect(selected.ok()).toBe(true);
  const identity = await selected.json() as { projectId: string; profileScope: string };
  expect(identity.projectId).toBeTruthy();
  expect(identity.profileScope).toBeTruthy();
  await expect(historical).toHaveAttribute("data-active", "true", { timeout: 15_000 });
  await expect(page.getByTestId("lo-project-scope-name")).toContainText(HISTORICAL_FORMS);
  await expect(page.getByTestId("lo-project-scope-profile")).toContainText(identity.profileScope);
  await closeLeftSidebar(page);
  return identity;
}

interface DurableTabIdentity {
  activeTabId: string | null;
  tabs: Array<{ id: string; surfaceId: string; constellationId: string | null }>;
}

async function durableTabIdentity(page: Page): Promise<DurableTabIdentity> {
  return page.evaluate(async () => {
    const sessionId = document.cookie.split(";").map((entry) => entry.trim())
      .find((entry) => entry.startsWith("research_canvas_session_id="))?.slice("research_canvas_session_id=".length);
    if (!sessionId) throw new Error("research-canvas session cookie was not established");
    const response = await fetch("http://127.0.0.1:4789/workspace/app-tabs", {
      headers: { "X-Research-Canvas-Session": sessionId },
    });
    if (!response.ok) throw new Error(`Persisted tabs read failed (${response.status})`);
    const snapshot = await response.json() as {
      activeTabId: string | null;
      tabs: Array<{ id: string; surfaceId: string; state: { constellationId?: string } }>;
    };
    return {
      activeTabId: snapshot.activeTabId,
      tabs: snapshot.tabs.map((tab) => ({ id: tab.id, surfaceId: tab.surfaceId, constellationId: tab.state.constellationId ?? null })),
    };
  });
}

async function waitForDurablePalace(page: Page, owner: string): Promise<DurableTabIdentity> {
  await expect.poll(async () => {
    const snapshot = await durableTabIdentity(page);
    const active = snapshot.tabs.find((tab) => tab.id === snapshot.activeTabId);
    return { surfaceId: active?.surfaceId, constellationId: active?.constellationId };
  }).toEqual({ surfaceId: "palace", constellationId: owner });
  const saved = await durableTabIdentity(page);
  expect(saved.tabs.filter((tab) => tab.surfaceId !== "projects").every((tab) => Boolean(tab.constellationId))).toBe(true);
  return saved;
}

async function attachCanonicalBandaPlace(page: Page): Promise<void> {
  await page.evaluate(async ({ graphNodeId }) => {
    const sessionId = document.cookie.split(";").map((entry) => entry.trim())
      .find((entry) => entry.startsWith("research_canvas_session_id="))?.slice("research_canvas_session_id=".length);
    if (!sessionId) throw new Error("research-canvas browser session cookie was not established");
    const response = await fetch("http://127.0.0.1:4789/graph/node/update", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Research-Canvas-Session": sessionId },
      body: JSON.stringify({
        graphNodeId,
        patch: {
          placeCoverage: "resolved",
          place: {
            graphNodeId, names: [{ language: "en", name: "Banda Islands" }],
            coordinate: { precision: "approximate", latitude: -4.55, longitude: 129.9 },
            hierarchy: [], externalRefs: [], provenance: { sourceRefs: [] },
          },
        },
      }),
    });
    if (!response.ok) throw new Error(`local Place update failed (${response.status}): ${await response.text()}`);
  }, { graphNodeId: BANDA });
}

async function addStoryScene(page: Page, title: string, narration: string, transition: "fade" | "dissolve"): Promise<void> {
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
  return page.getByTestId("app-tabbar").locator(".app-tabbar__item").evaluateAll((items) => items.map((item) => {
    const surface = item.querySelector(".app-tabbar__surface")?.textContent?.trim() ?? "";
    const label = item.querySelector(".app-tabbar__label")?.textContent?.trim() ?? "";
    return `${surface}|${label}`;
  }));
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
  await expect(page.getByTestId("lo-project-scope-profile")).toContainText("project:t17-restart-project", { timeout: 20_000 });
  await page.reload();
  await openFiles(page);
  await expect(page.getByTestId("lo-project-scope-name")).toContainText(projectName, { timeout: 35_000 });
  await expect(page.getByTestId("lo-project-scope-profile")).toContainText("project:t17-restart-project", { timeout: 35_000 });
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test("full project journey restores tabs, active surface and persisted surface state", async ({ page, context }) => {
  test.setTimeout(180_000);
  const external = externalRequestCollector(page);
  const errors = errorCollector(page);
  const journeyTitle = `T17 integrated journey ${Date.now()}`;
  await page.goto("/");
  await expect(page.getByTestId("canvas-pane")).toBeVisible({ timeout: 20_000 });
  await selectRootProject(page);
  await waitForSeededGraphReady(page);
  await closeLeftSidebar(page);

  // Canvas: real canonical lineage, an authored note and image, and their edge.
  await expect(page.locator(".canvas-flow")).toContainText("Christ Sixfold Spectral Lineage", { timeout: 20_000 });
  const pane = page.getByTestId("canvas-pane");
  await pane.click({ button: "right", position: { x: 340, y: 230 } });
  await page.getByRole("menuitem", { name: /^Add note\b/ }).click();
  const note = page.locator(".react-flow__node-note").last();
  await expect(note).toBeVisible();
  const paneBox = await pane.boundingBox();
  expect(paneBox).not.toBeNull();
  const imageEntry = JSON.stringify({
    id: "t17-image-drop", kind: "image", name: "dropped-image.png",
    relativePath: "fixtures/dropped-image.png", absolutePath: "/fixtures/dropped-image.png",
  });
  const flowElement = await page.locator(".react-flow").elementHandle();
  if (!flowElement) throw new Error("React Flow surface was not available for image drop");
  await flowElement.evaluate((element, { data, dropX, dropY }) => {
    const dataTransfer = new DataTransfer();
    dataTransfer.setData("application/x-canvas-entry", data);
    dataTransfer.effectAllowed = "copy";
    dataTransfer.dropEffect = "copy";
    element.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, clientX: dropX, clientY: dropY, dataTransfer }));
    element.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, clientX: dropX, clientY: dropY, dataTransfer }));
  }, { data: imageEntry, dropX: paneBox!.x + Math.min(paneBox!.width - 80, 620), dropY: paneBox!.y + 230 });
  const image = page.locator(".react-flow__node-image").last();
  await expect(image).toBeVisible({ timeout: 15_000 });
  const noteId = await note.getAttribute("data-id");
  const imageId = await image.getAttribute("data-id");
  expect(noteId).toBeTruthy();
  expect(imageId).toBeTruthy();
  await page.addStyleTag({ content: ".flow-handle { opacity: 1 !important; pointer-events: all !important; z-index: 10 !important; }" });
  const source = note.locator("[data-handleid='source-right']");
  const target = image.locator("[data-handleid='target-left']");
  await expect(source).toBeAttached();
  await expect(target).toBeAttached();
  const edgeCountBeforeConnect = await page.locator("[data-testid^='edge-']").count();
  await source.dispatchEvent("click", { button: 0, bubbles: true, cancelable: true });
  await page.waitForTimeout(100);
  await target.dispatchEvent("click", { button: 0, bubbles: true, cancelable: true });
  await expect(page.locator("[data-testid^='edge-']")).toHaveCount(edgeCountBeforeConnect + 1, { timeout: 15_000 });
  const edgeCountAfterConnect = edgeCountBeforeConnect + 1;
  const historicalIdentity = await selectHistoricalForms(page);

  // Timeline: the real command palette, canonical nodes and semantic camera.
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
  // Anchor semantic zoom at Medici's actual time, not an unrelated century.
  const track = page.getByTestId("timeline-track");
  const mediciMarker = page.getByTestId(`timeline-node-marker-${MEDICI}`);
  await expect(mediciMarker).toBeVisible({ timeout: 15_000 });
  const markerBox = await mediciMarker.boundingBox();
  const trackBox = await track.boundingBox();
  const browserViewport = page.viewportSize();
  expect(markerBox).not.toBeNull();
  expect(trackBox).not.toBeNull();
  expect(browserViewport).not.toBeNull();
  const trackLeft = Math.max(0, trackBox!.x);
  const trackRight = Math.min(browserViewport!.width - 1, trackBox!.x + trackBox!.width - 1);
  const trackTop = Math.max(0, trackBox!.y);
  const trackBottom = Math.min(browserViewport!.height - 1, trackBox!.y + trackBox!.height - 1);
  expect(trackRight).toBeGreaterThan(trackLeft);
  expect(trackBottom).toBeGreaterThan(trackTop);
  const mediciAnchorX = markerBox!.x + markerBox!.width / 2;
  await page.mouse.move(Math.min(trackRight, Math.max(trackLeft, mediciAnchorX)), trackTop + (trackBottom - trackTop) / 2);
  await page.mouse.wheel(0, -600);
  await expect(page.getByTestId("timeline-tier")).toHaveText("century", { timeout: 15_000 });
  const mediciCard = page.getByTestId(`timeline-node-card-${MEDICI}`);
  await expect(mediciCard).toBeVisible({ timeout: 15_000 });
  await mediciCard.click({ modifiers: ["Shift"] });
  await expect(page.getByTestId(`timeline-working-set-entry-${MEDICI}`)).toBeVisible();

  // Places: enrich and select the same canonical Banda record on MapLibre.
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

  // Story: author and persist a real two-scene journey.
  await page.getByTestId("lens-story").click();
  await expect(page.getByTestId("story-surface")).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("story-new-journey-title").fill(journeyTitle);
  await page.getByTestId("story-create-journey").click();
  await expect(page.getByTestId("story-journey-list").getByRole("button", { name: new RegExp(journeyTitle) })).toBeVisible({ timeout: 15_000 });
  await addStoryScene(page, "Arrival", "The first integrated scene.", "fade");
  await addStoryScene(page, "Aftermath", "The second integrated scene.", "dissolve");
  await expect(page.getByTestId("story-scene-strip").locator('button[data-testid^="story-scene-"]')).toHaveCount(2);

  // Palace: generated rooms plus a manually authored room and wall object.
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
  await expect(await tabItem(page, "Palace")).toHaveAttribute("data-active", "true");
  await expect(page.getByTestId("palace-save-state")).toHaveText("Saved", { timeout: 10_000 });
  const identityBeforeRestart = await waitForDurablePalace(page, historicalIdentity.projectId);

  // Repository-owned restore: erase localStorage, but keep the session cookie.
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByTestId("palace-surface")).toBeVisible({ timeout: 35_000 });
  await expectWorkspace(page, HISTORICAL_FORMS, historicalIdentity.profileScope);
  expect(await waitForDurablePalace(page, historicalIdentity.projectId)).toEqual(identityBeforeRestart);
  await expect(page.getByTestId(`palace-room-${manualRoomId}`)).toBeVisible();
  await expect(page.locator('[data-testid^="palace-wall-object-manual:object:"]')).toHaveCount(1);
  expect(await tabSnapshot(page)).toEqual(tabsBeforeRestart);
  await expect(await tabItem(page, "Palace")).toHaveAttribute("data-active", "true");

  // Fresh-page restore must reconstruct the same owner, not merely its title.
  await page.close();
  const reopenedPage = await context.newPage();
  const reopenedExternal = externalRequestCollector(reopenedPage);
  const reopenedErrors = errorCollector(reopenedPage);
  await reopenedPage.goto("/");
  await expect(reopenedPage.getByTestId("palace-surface")).toBeVisible({ timeout: 35_000 });
  await expectWorkspace(reopenedPage, HISTORICAL_FORMS, historicalIdentity.profileScope);
  expect(await waitForDurablePalace(reopenedPage, historicalIdentity.projectId)).toEqual(identityBeforeRestart);
  await expect(reopenedPage.getByTestId(`palace-room-${manualRoomId}`)).toBeVisible();
  await expect(reopenedPage.locator('[data-testid^="palace-wall-object-manual:object:"]')).toHaveCount(1);
  expect(await tabSnapshot(reopenedPage)).toEqual(tabsBeforeRestart);
  await expect(await tabItem(reopenedPage, "Palace")).toHaveAttribute("data-active", "true");

  await activateSurfaceTab(reopenedPage, "Story");
  const restoredJourney = reopenedPage.getByTestId("story-journey-list").getByRole("button", { name: new RegExp(journeyTitle) });
  await expect(restoredJourney).toBeVisible({ timeout: 20_000 });
  await restoredJourney.click();
  await expect(reopenedPage.getByTestId("story-scene-strip").locator('button[data-testid^="story-scene-"]')).toHaveCount(2);
  await activateSurfaceTab(reopenedPage, "Places");
  const restoredGlobe = reopenedPage.getByTestId("places-globe");
  await expect(restoredGlobe).toBeVisible({ timeout: 25_000 });
  await expect(reopenedPage.getByTestId("places-location-panel")).toContainText("Banda Genocide", { timeout: 20_000 });
  await expect(reopenedPage.getByTestId("place-coordinates")).toContainText("-4.55000, 129.90000");
  await expect.poll(async () => restoredGlobe.getAttribute("data-center")).toBe(placesCenter);
  await activateSurfaceTab(reopenedPage, "Timeline");
  await expect(reopenedPage.getByTestId("timeline-surface")).toBeVisible({ timeout: 20_000 });
  await expect(reopenedPage.getByTestId("timeline-tier")).toHaveText("century", { timeout: 20_000 });

  // Returning to Root's Canvas restores Root, rather than moving its authored
  // cards into the currently active Historical Forms project.
  await activateSurfaceTab(reopenedPage, "Canvas", ROOT_PROJECT_NAME);
  await expectWorkspace(reopenedPage, ROOT_PROJECT_NAME, "bootstrapping");
  await expect(reopenedPage.locator(`.react-flow__node[data-id="${noteId}"]`)).toBeAttached({ timeout: 20_000 });
  await expect(reopenedPage.locator(`.react-flow__node[data-id="${imageId}"]`)).toBeAttached({ timeout: 20_000 });
  await expect(reopenedPage.locator("[data-testid^='edge-']")).toHaveCount(edgeCountAfterConnect, { timeout: 20_000 });
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  expect(reopenedErrors).toEqual([]);
  expect(reopenedExternal).toEqual([]);
});
