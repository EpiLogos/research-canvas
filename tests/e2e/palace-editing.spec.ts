import { expect, test, type Page } from "@playwright/test";

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

test("Palace edits rooms, corridors and wall objects and restores them after reload", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await expect(page.getByTestId("lo-project-scope-profile")).toBeAttached({ timeout: 35_000 });
  await openPalace(page);

  const rooms = page.getByTestId("palace-rooms-panel").locator("li");
  const generatedRoomCount = await rooms.count();
  expect(generatedRoomCount).toBeGreaterThan(0);

  await page.getByTestId("palace-add-room").click();
  await expect(rooms).toHaveCount(generatedRoomCount + 1);
  const editedRoomCount = await rooms.count();

  const corridors = page.getByTestId("palace-layout-corridors-panel").locator("li");
  const corridorCount = await corridors.count();
  await page.getByTestId("palace-add-corridor").click();
  await expect(corridors).toHaveCount(corridorCount + 1);

  await page.getByTestId("palace-place-object").click();
  await expect(page.getByTestId("palace-place-ghost")).toBeVisible();
  await page.getByTestId("palace-wall-face-east").click();
  await expect(page.getByTestId("palace-place-ghost")).toContainText("east face");
  await page.getByTestId("palace-place-confirm").click();
  const manualObjects = page.locator('[data-testid^="palace-wall-object-manual:object:"]');
  await expect(manualObjects).toHaveCount(1);
  await expect(manualObjects.first()).toHaveAttribute("data-face", "east");

  // The existing generated Palace remains mounted throughout the editing flow.
  await expect(page.getByTestId("palace-canvas")).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("lo-project-scope-profile")).toBeAttached({ timeout: 35_000 });
  await openPalace(page);
  await expect(page.getByTestId("palace-rooms-panel").locator("li")).toHaveCount(editedRoomCount);
  await expect(page.locator('[data-testid^="palace-wall-object-manual:object:"]')).toHaveCount(1);
});
