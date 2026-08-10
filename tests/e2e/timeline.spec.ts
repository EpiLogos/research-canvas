import { expect, test, type Page } from "@playwright/test";

/**
 * Task-8 acceptance gate: the timeline stays light (dated events only), and
 * clicking a node loads its REAL relational depth into the working-set stack
 * (edges + neighbours, property-complete) with deep properties surfaced; the
 * global/temporal walk traverses dated located events with sub-timelines mapped
 * in place. All of it fully offline — only localhost origins (the Vite dev
 * server on 4173 and the terminal bridge on 4789) may be contacted. The
 * hostname-filtered network audit runs BEFORE and AFTER the interaction.
 *
 * The expansion click is dispatched directly onto the node (deterministic —
 * it never depends on card hit-testing at a given zoom tier), then the working
 * set, deep properties, and the in-place walk frame are asserted.
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

test("timeline expands one node's real relational depth into the working set, walk frames it in place, fully offline", async ({
  page,
}) => {
  const external = await collectExternalRequests(page);

  await page.goto("/");
  await page.getByTestId("lens-timeline").click();

  // The timeline track boots without an error banner.
  await expect(page.getByTestId("timeline-track")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("timeline-load-error")).toHaveCount(0, {
    timeout: 15_000,
  });

  // The global/temporal walk is the timeline's spine: dated events traverse in
  // ascending order, located and unlocated alike (Earth is the spatial
  // zero-case). A real corpus produces real stops.
  await expect(page.getByTestId("timeline-walk")).toBeVisible();
  await expect(page.getByTestId("timeline-walk-stops").locator("li")).not.toHaveCount(0);

  // Offline gate part 1: the base view and walk draw with zero external requests.
  expect(external).toEqual([]);

  // Lazy relational expansion: clicking a dated node loads its real edges and
  // neighbours into the working-set stack. Dispatched directly so the assertion
  // never depends on card hit-testing at the current zoom tier.
  const mediciNode = page.getByTestId(`timeline-node-${MEDICI}`);
  await expect(mediciNode).toBeAttached({ timeout: 15_000 });
  await mediciNode.dispatchEvent("click");

  // The working set stacks the clicked node with its real edges + neighbours.
  await expect(page.getByTestId("timeline-working-set")).toBeVisible();
  const entry = page.getByTestId(`timeline-working-set-entry-${MEDICI}`);
  await expect(entry).toBeVisible();
  await expect(entry).toHaveAttribute("data-edge-count", /^[1-9]\d*$/);
  await expect(entry).toHaveAttribute("data-neighbour-count", /^[1-9]\d*$/);

  // Deep edge properties surface (dominance → role, precision, provenance).
  await expect(entry).toContainText("dominant");

  // The base timeline view stays light: the expansion is a stack entry, not a
  // mutation of the dated events on the axis.
  await expect(page.getByTestId("timeline-scene")).toBeVisible();

  // The walk's medici stop is now framed in place (nested sub-timeline), never
  // a separate lens.
  const stop = page.getByTestId(`timeline-walk-stop-${MEDICI}`);
  await expect(stop).toHaveAttribute("data-framed", "true");

  // Unloading removes the node from the stack; the walk keeps its stops.
  await page.getByTestId(`timeline-working-set-unload-${MEDICI}`).click();
  await expect(entry).not.toBeVisible();
  await expect(page.getByTestId("timeline-walk-stops").locator("li")).not.toHaveCount(0);

  // Still fully offline after expansion, framing, and unload.
  expect(external).toEqual([]);
});
