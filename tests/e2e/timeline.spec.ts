import { expect, test, type Page } from "@playwright/test";

/**
 * T11 acceptance gate: select a real constellation that owns dated historical
 * nodes, then prove Surface #2 renders that earthbound walk and keeps the rich
 * relational timeline behaviour while remaining fully offline.
 */

const HISTORICAL_FORMS = "Historical Forms";
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
  await expect(page.getByTestId("canvas-pane")).toBeVisible({ timeout: 20_000 });

  // The root project contains nested constellations. T11 is explicitly scoped
  // to the active constellation, so choose the seeded historical constellation
  // that actually owns the dated Medici event instead of relying on the old
  // profile/global timeline leak.
  const rail = page.getByTestId("left-rail");
  await rail.getByRole("button", { name: "Files & Constellation", exact: true }).dispatchEvent("click");
  const historicalForms = page
    .getByTestId("lo-constellations")
    .locator(".lo-constellation-item", { hasText: HISTORICAL_FORMS });
  await expect(historicalForms).toBeAttached();
  await historicalForms.dispatchEvent("click");
  await expect(historicalForms).toHaveAttribute("data-active", "true", { timeout: 15_000 });

  await page.getByTestId("lens-timeline").dispatchEvent("click");

  await expect(page.getByTestId("timeline-surface")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("timeline-earthbound-track")).toBeVisible();
  await expect(page.getByTestId("timeline-axis")).toBeVisible();
  await expect(page.getByTestId("timeline-zoom-out")).toBeVisible();
  await expect(page.getByTestId("timeline-fit")).toBeVisible();
  await expect(page.getByTestId("timeline-zoom-in")).toBeVisible();
  await expect(page.getByTestId("timeline-track")).toBeVisible();
  await expect(page.getByTestId("timeline-load-error")).toHaveCount(0, {
    timeout: 15_000,
  });

  await expect(page.getByTestId("timeline-walk")).toBeVisible();
  await expect(page.getByTestId("timeline-walk-stops").locator("li")).not.toHaveCount(0);
  expect(external).toEqual([]);

  const mediciCard = page.getByTestId(`timeline-card-${MEDICI}`);
  const mediciNode = page.getByTestId(`timeline-node-${MEDICI}`);
  await expect(mediciCard).toBeVisible({ timeout: 15_000 });
  await expect(mediciCard).toContainText("Medici Template");
  await expect(mediciNode).toBeAttached();

  // The existing rich timeline still opens its lazy real relational working
  // set without asking the T11 wrapper to navigate away from Surface #2.
  await mediciNode.dispatchEvent("click", { detail: 0 });

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

  // A genuine single activation is the T11 navigation contract: it opens the
  // selected node in the active constellation's Canvas tab by default.
  await mediciNode.dispatchEvent("click", { detail: 1 });
  await expect(page.getByTestId("canvas-pane")).toBeVisible({ timeout: 5_000 });
  expect(external).toEqual([]);
});
