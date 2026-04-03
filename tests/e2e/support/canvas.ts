import { expect, type Locator, type Page } from "@playwright/test";

export async function waitForWorkspace(page: Page) {
  await expect(page.locator(".canvas-footer")).toBeVisible({ timeout: 30_000 });
}

export async function openRightTab(
  page: Page,
  tab: "Content" | "Inspector" | "Sequences" | "Terminal",
) {
  const buttons = page.getByRole("button", { name: tab, exact: true });
  await buttons.nth(tab === "Sequences" ? 1 : 0).click();
}

export async function selectCanvasNode(page: Page, title: string) {
  const node = canvas(page)
    .locator(".react-flow__node")
    .filter({ hasText: title })
    .first();
  await expect(node).toBeVisible();
  await node.click();
}

export async function selectFirstNoteNode(page: Page) {
  const node = canvas(page).locator(".react-flow__node:has(.note-node)").first();
  await expect(node).toBeVisible();
  await node.click();
}

export function canvas(page: Page): Locator {
  return page.locator(".canvas-flow");
}

export function selectedCanvasNode(page: Page): Locator {
  return canvas(page).locator(".react-flow__node.selected").first();
}

export async function expectNoCanvasError(page: Page) {
  await expect(page.getByRole("status")).toHaveCount(0);
}
