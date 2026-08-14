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
  await expect(page.getByTestId("canvas-pane")).toBeVisible({ timeout: 20_000 });

  // The compact desktop shell can position the left-rail toggle outside the
  // browser viewport even though it is mounted and keyboard/action reachable.
  // Constellation selection is fixture setup for this ticket, not a T11
  // interaction gate, so activate those existing controls at the DOM boundary.
  const rail = page.getByTestId("left-rail");
  await rail
    .getByRole("button", { name: "Files & Constellation", exact: true })
    .dispatchEvent("click");
  const historicalForms = page
    .getByTestId("lo-constellations")
    .getByRole("button", { name: /^Historical Forms\b/ });
  await expect(historicalForms).toBeAttached();
  await historicalForms.dispatchEvent("click");
  await expect(historicalForms).toHaveAttribute("data-active", "true", { timeout: 15_000 });

  await page.getByTestId("lens-timeline").click();

  const surface = page.getByTestId("timeline-surface");
  await expect(surface).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("timeline-earthbound-track")).toBeVisible();
  await expect(page.getByTestId("timeline-axis")).toBeVisible();
  await expect(page.getByTestId("timeline-zoom-out")).toBeVisible();
  await expect(page.getByTestId("timeline-fit")).toBeVisible();
  await expect(page.getByTestId("timeline-zoom-in")).toBeVisible();
  await expect(page.getByTestId("timeline-track")).toBeVisible();
  await expect(page.getByTestId("timeline-load-error")).toHaveCount(0, {
    timeout: 15_000,
  });

  // Exercise a real zoom from the global overview, then Fit the active
  // constellation so its ordinary card-level representation is in view.
  await page.getByTestId("timeline-zoom-in").click();
  await expect(surface).toBeVisible();
  await page.getByTestId("timeline-fit").click();
  await expect(surface).toBeVisible();

  await expect(page.getByTestId("timeline-walk")).toBeVisible();
  await expect(page.getByTestId("timeline-walk-stops").locator("li")).not.toHaveCount(0);
  expect(external).toEqual([]);

  const mediciCard = page.getByTestId(`timeline-card-${MEDICI}`);
  const mediciNode = page.getByTestId(`timeline-node-${MEDICI}`);
  await expect(mediciCard).toBeVisible({ timeout: 15_000 });
  await expect(mediciCard).toContainText("Medici Template");
  await expect(mediciNode).toBeAttached();

  // Shift-click is the real timeline-local exploration affordance. It lets the
  // mature relational working set open while default click remains T11's
  // Canvas navigation contract.
  await mediciNode.click({ modifiers: ["Shift"] });

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
  // constellation's Canvas tab.
  await mediciNode.click();
  await expect(page.getByTestId("canvas-pane")).toBeVisible({ timeout: 5_000 });
  expect(external).toEqual([]);
});
