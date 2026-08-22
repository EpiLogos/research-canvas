import { expect, test, type Locator, type Page } from "@playwright/test";
import { waitForSeededGraphReady } from "./helpers/project";

async function closeLeftSidebar(page: Page): Promise<void> {
  const sidebar = page.getByTestId("shell-left-sidebar");
  if (await sidebar.getAttribute("data-open") !== "true") return;
  const activeButton = page.getByTestId("left-rail").locator('button[data-active="true"]').first();
  if (await activeButton.count()) {
    await activeButton.click();
    await expect(sidebar).toHaveAttribute("data-open", "false");
  }
}

async function openPalace(page: Page): Promise<void> {
  await closeLeftSidebar(page);
  await page.getByTestId("lens-palace").click();
  await expect(page.getByTestId("palace-surface")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId("palace-toolbar")).toBeVisible();
}

async function dataTestId(locator: Locator): Promise<string> {
  const value = await locator.getAttribute("data-testid");
  expect(value).not.toBeNull();
  return value!;
}

function suffix(testId: string, prefix: string): string {
  expect(testId.startsWith(prefix)).toBe(true);
  return testId.slice(prefix.length);
}

test("Palace adopts, edits and restores curation over the mature generated palace", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(page.getByTestId("lo-project-scope-profile")).toBeAttached({ timeout: 35_000 });
  await waitForSeededGraphReady(page);
  await openPalace(page);

  const rooms = page.getByTestId("palace-rooms-panel").locator("li");
  const generatedRoomCount = await rooms.count();
  expect(generatedRoomCount).toBeGreaterThan(1);

  // Explicitly adopt/regenerate the current constellation without replacing
  // the mature graph/QL/encapsulation renderer.
  await page.getByTestId("palace-generate").click();
  await expect(rooms).toHaveCount(generatedRoomCount);
  await expect(page.getByTestId("palace-canvas")).toBeVisible();

  // Add and delete are both real persisted layout operations.
  await page.getByTestId("palace-add-room").click();
  await expect(rooms).toHaveCount(generatedRoomCount + 1);
  const disposableRoomTestId = await dataTestId(rooms.last());
  const disposableRoomId = suffix(disposableRoomTestId, "palace-room-");
  await page.getByTestId(`palace-delete-room-${disposableRoomId}`).click();
  await expect(rooms).toHaveCount(generatedRoomCount);

  // Keep a manual room, join it to the generated substrate, and curate a wall
  // object on a specific face.
  await page.getByTestId("palace-add-room").click();
  await expect(rooms).toHaveCount(generatedRoomCount + 1);
  const manualRoomTestId = await dataTestId(rooms.last());
  const manualRoomId = suffix(manualRoomTestId, "palace-room-");
  const editedRoomCount = generatedRoomCount + 1;

  const corridors = page.getByTestId("palace-layout-corridors-panel").locator("li");
  const corridorCount = await corridors.count();
  await page.getByTestId("palace-add-corridor").click();
  await expect(corridors).toHaveCount(corridorCount + 1);

  await page.getByTestId("palace-place-object").click();
  await expect(page.getByTestId("palace-place-ghost")).toBeVisible();
  await page.getByTestId("palace-place-room").selectOption(manualRoomId);
  await page.getByTestId("palace-wall-face-east").click();
  await expect(page.getByTestId("palace-place-ghost")).toContainText("east face");
  await page.getByTestId("palace-place-confirm").click();
  const manualObjects = page.locator('[data-testid^="palace-wall-object-manual:object:"]');
  await expect(manualObjects).toHaveCount(1);
  await expect(manualObjects.first()).toHaveAttribute("data-face", "east");

  // Reorder through the mature Palace curation controls. Guided recall must
  // follow this generated curated order even though the layout overlay was
  // persisted earlier in its original order.
  const chambers = page
    .getByTestId("palace-chambers")
    .locator('[data-testid^="palace-chamber-"]');
  const firstChamberTestId = await dataTestId(chambers.nth(0));
  const secondChamberTestId = await dataTestId(chambers.nth(1));
  const firstChamberId = suffix(firstChamberTestId, "palace-chamber-");
  const secondChamberId = suffix(secondChamberTestId, "palace-chamber-");
  await page.getByTestId(`palace-down-${firstChamberId}`).click();
  await expect(chambers.nth(0)).toHaveAttribute("data-testid", secondChamberTestId);

  const walk = page.getByTestId("palace-walk-chambers").locator('span[data-testid^="palace-walk-"]');
  await expect(walk.nth(0)).toHaveAttribute("data-testid", `palace-walk-${secondChamberId}`);
  await page.getByTestId("palace-mode-recall").click();
  await expect(page.getByTestId("palace-recall")).toContainText(`Revealed 1 of ${editedRoomCount} chambers`);
  await expect(page.getByTestId(`palace-walk-${secondChamberId}`)).toHaveAttribute("data-revealed", "true");
  await expect(page.getByTestId(`palace-walk-${firstChamberId}`)).toHaveAttribute("data-revealed", "false");
  await page.getByTestId("palace-reveal-next").click();
  await expect(page.getByTestId(`palace-walk-${firstChamberId}`)).toHaveAttribute("data-revealed", "true");

  // The existing generated Palace remains mounted throughout the editing flow.
  await expect(page.getByTestId("palace-canvas")).toBeVisible();

  // Reload reconstructs both the SQLite layout overlay and mature curation.
  await page.reload();
  await expect(page.getByTestId("lo-project-scope-profile")).toBeAttached({ timeout: 35_000 });
  await waitForSeededGraphReady(page);
  await openPalace(page);
  const reloadedRooms = page.getByTestId("palace-rooms-panel").locator("li");
  await expect(reloadedRooms).toHaveCount(editedRoomCount);
  await expect(page.getByTestId(`palace-room-${manualRoomId}`)).toBeVisible();
  await expect(page.locator('[data-testid^="palace-wall-object-manual:object:"]')).toHaveCount(1);
  await expect(page.getByTestId("palace-layout-corridors-panel").locator("li")).toHaveCount(corridorCount + 1);
  const reloadedChambers = page
    .getByTestId("palace-chambers")
    .locator('[data-testid^="palace-chamber-"]');
  await expect(reloadedChambers.nth(0)).toHaveAttribute("data-testid", secondChamberTestId);
  const reloadedWalk = page.getByTestId("palace-walk-chambers").locator('span[data-testid^="palace-walk-"]');
  await expect(reloadedWalk.nth(0)).toHaveAttribute("data-testid", `palace-walk-${secondChamberId}`);
  await page.getByTestId("palace-mode-recall").click();
  await expect(page.getByTestId("palace-recall")).toContainText(`Revealed 1 of ${editedRoomCount} chambers`);
});