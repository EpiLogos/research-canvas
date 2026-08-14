import { expect, test, type Page } from "@playwright/test";

/**
 * Timeline acceptance gate: the global/temporal walk remains light and fully
 * offline, while Surface #2 now exposes its canonical earthbound track,
 * persistent navigation controls, and lazy real relational depth.
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

test("timeline surface keeps the real relational walk and canonical controls fully offline", async ({
  page,
}) => {
  const external = await collectExternalRequests(page);

  await page.goto("/");
  await page.getByTestId("lens-timeline").click();

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

  const mediciNode = page.getByTestId(`timeline-node-${MEDICI}`);
  await expect(mediciNode).toBeAttached({ timeout: 15_000 });
  // detail=0 is the test/agent selection path: it exercises the rich working
  // set without asking Surface #2 to navigate away from the timeline.
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

  // A genuine single activation opens the active constellation's Canvas tab by
  // default; the surface state has already persisted its selected graph node.
  await mediciNode.dispatchEvent("click", { detail: 1 });
  await expect(page.getByTestId("canvas-pane")).toBeVisible({ timeout: 5_000 });
  expect(external).toEqual([]);
});
