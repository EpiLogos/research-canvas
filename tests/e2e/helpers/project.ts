import { expect, type Page } from "@playwright/test";

/**
 * Wait for the hosted browser bridge to materialize the sample project's local
 * graph inventory before a surface snapshots it. CI deliberately runs without
 * the foundational vault / live Neo4j relation source, so a zero relationship
 * count is a valid hosted state; non-zero nodes are the readiness signal here.
 */
export async function waitForSeededGraphReady(page: Page): Promise<void> {
  await expect(page.getByText(/[1-9]\d* nodes · \d+ relations/)).toBeVisible({
    timeout: 35_000,
  });
}
