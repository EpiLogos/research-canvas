import { expect, type Page } from "@playwright/test";

export async function waitForWorkspace(page: Page) {
  await expect(page.locator(".canvas-footer")).toBeVisible({ timeout: 30_000 });
}

export async function currentNodeCount(page: Page): Promise<number> {
  const text = await page.locator(".canvas-footer").textContent();
  const match = text?.match(/(\d+) nodes/);
  if (!match) throw new Error(`Could not read node count from canvas footer: ${text}`);
  return Number(match[1]);
}

export async function fitCanvas(page: Page) {
  await page.getByRole("button", { name: "Fit view" }).dispatchEvent("click");
  await page.waitForTimeout(350);
}

export async function openConstellation(page: Page, name: string) {
  const row = page
    .locator("[data-testid='lo-constellations'] .lo-constellation-item")
    .filter({ hasText: name })
    .first();
  await expect(row).toBeAttached();
  await row.dispatchEvent("click");
  await expect(page.getByRole("tab", { name })).toBeVisible();
  await waitForWorkspace(page);
}

export async function openFilesBrowserView(page: Page) {
  const overlay = page.getByTestId("left-overlay");
  if ((await overlay.getAttribute("data-open")) !== "true") {
    await page.getByRole("button", { name: "Files & Constellation" }).dispatchEvent("click");
  }
  await expect(overlay).toHaveAttribute("data-open", "true");
  await overlay.dispatchEvent("pointerenter");
  await page.getByTestId("browser-files").dispatchEvent("click");
  await expect(page.getByTestId("browser-files")).toHaveAttribute("data-active", "true");
}

export async function expectNoCanvasError(page: Page) {
  await expect(page.getByRole("status")).toHaveCount(0);
}
