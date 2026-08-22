import { expect, type Page } from "@playwright/test";

/**
 * Wait for the canonical sample project graph to finish bootstrapping before a
 * surface snapshots constellation data. Node rows arrive before relationships
 * in the browser bridge, so project/profile scope alone is not a readiness
 * signal for graph-derived surfaces such as Palace.
 */
export async function waitForSeededGraphReady(page: Page): Promise<void> {
  await expect(page.getByText(/\d+ nodes · [1-9]\d* relations/)).toBeVisible({
    timeout: 35_000,
  });
}
