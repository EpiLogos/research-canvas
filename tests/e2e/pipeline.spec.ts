import { expect, test, type Page } from "@playwright/test";

/**
 * Task-9 acceptance gate: an object is pushed through the FULL pipeline —
 * Constellations → Timeline → Places → Stories → Palace — with real data
 * visible at every stage, fully offline. The shell's five lenses are one
 * visible sequence; the flow view (inspector) shows the object's passage,
 * runs the next send-to action at the frontier, and jumps into each reached
 * stage's surface.
 *
 * The object is a REAL seeded corpus node (bull-ox, an atemporal archetype in
 * the dual-animal-quaternity constellation). Each send-to action writes to the
 * store its seam owns through the real browser bridge:
 *   Send to timeline  → date (updateGraphNode) + timeline layout
 *   Locate            → LOCATED_AT to a gazetted Temporal Place
 *   Add to story      → profile scene (upsertScene)
 *   Place in palace   → palace curation (never a graph write)
 * The hostname-filtered network audit runs before AND after — nothing leaves
 * the machine except localhost (Vite 4173 + terminal bridge 4789).
 */

const NS = "root-archetypal-field";
const DUAL_ANIMAL = `${NS}:dual-animal-quaternity`;
const BULL_OX = `${NS}:bull-ox`;
// Send-to actions mint profile-scoped ids from the SLUGIFIED graphNodeId
// (colons → dashes) — see slugifyGraphNodeId in usePipelineActions.ts.
const BULL_OX_SLUG = BULL_OX.replace(/[^a-zA-Z0-9]+/g, "-");
const BULL_OX_SCENE = `pipeline:${BULL_OX_SLUG}`;
const BULL_OX_OBJECT = `pipeline:${BULL_OX_SLUG}`;

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

test("an object is pushed through the full pipeline with real data at every stage, fully offline", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const external = await collectExternalRequests(page);

  await page.goto("/");
  await expect(page.getByTestId("canvas-pane")).toBeVisible({ timeout: 20_000 });

  // ---- 1. CONSTELLATIONS: navigate into a real constellation canvas and
  // select a real corpus object (bull-ox, an atemporal archetype). ----
  const dualPortal = page.getByTestId(`rf__node-${DUAL_ANIMAL}`);
  await expect(dualPortal).toBeAttached({ timeout: 20_000 });
  await dualPortal.dispatchEvent("dblclick");

  const bullOxNode = page.getByTestId(`rf__node-${BULL_OX}`);
  await expect(bullOxNode).toBeAttached({ timeout: 20_000 });
  await bullOxNode.dispatchEvent("click");

  // The inspector hosts the flow view for the selected object.
  await expect(page.getByTestId("flow-view")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("flow-subject")).toContainText("Bull");
  await expect(page.getByTestId("flow-view")).toHaveAttribute("data-object", BULL_OX);
  await expect(page.getByTestId("flow-stage-constellations")).toHaveAttribute(
    "data-reached",
    "true",
  );
  await expect(page.getByTestId("flow-stage-timeline")).toHaveAttribute(
    "data-reached",
    "false",
  );

  // ---- 2. SEND TO TIMELINE: date the object through the real seam. ----
  await page.getByTestId("flow-year-input").fill("1600");
  await page.getByTestId("flow-send-to-timeline").click();
  await expect(page.getByTestId("flow-stage-timeline")).toHaveAttribute(
    "data-reached",
    "true",
    { timeout: 20_000 },
  );
  await expect(page.getByTestId("rail-count-timeline")).toContainText("1");

  // Jump into the timeline surface: the object is now a dated node on the axis.
  await page.getByTestId("flow-jump-timeline").click();
  await expect(page.getByTestId("timeline-pane")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId(`timeline-node-${BULL_OX}`)).toBeAttached({
    timeout: 20_000,
  });

  // ---- 3. LOCATE: assign a Temporal Place (LOCATED_AT) through the seam. ----
  await expect(page.getByTestId("flow-stage-places")).toHaveAttribute(
    "data-reached",
    "false",
  );
  // A real gazetted Place is offered as the candidate.
  await expect(page.getByTestId("flow-place-select").locator("option").first()).toBeAttached();
  await page.getByTestId("flow-locate").click();
  await expect(page.getByTestId("flow-stage-places")).toHaveAttribute(
    "data-reached",
    "true",
    { timeout: 20_000 },
  );

  // Jump into the places surface: the object is now a located stop.
  await page.getByTestId("flow-jump-places").click();
  await expect(page.getByTestId("psychogeographic-surface")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId("psychogeographic-stops").locator("li")).not.toHaveCount(0);
  await expect(page.getByTestId("psychogeographic-error")).toHaveCount(0, {
    timeout: 10_000,
  });

  // ---- 4. ADD TO STORY: create a profile scene through the seam. ----
  await expect(page.getByTestId("flow-stage-stories")).toHaveAttribute(
    "data-reached",
    "false",
  );
  await page.getByTestId("flow-add-to-story").click();
  await expect(page.getByTestId("flow-stage-stories")).toHaveAttribute(
    "data-reached",
    "true",
    { timeout: 20_000 },
  );

  // Jump into the story surface: the pipeline scene is a real story scene.
  await page.getByTestId("flow-jump-stories").click();
  await expect(page.getByTestId("story-lens")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId(`story-scene-${BULL_OX_SCENE}`)).toBeAttached({
    timeout: 20_000,
  });

  // ---- 5. PLACE IN PALACE: curate the object into a chamber (never a graph
  // write). ----
  await expect(page.getByTestId("flow-stage-palace")).toHaveAttribute(
    "data-reached",
    "false",
  );
  await page.getByTestId("flow-place-in-palace").click();
  await expect(page.getByTestId("flow-stage-palace")).toHaveAttribute(
    "data-reached",
    "true",
    { timeout: 20_000 },
  );

  // Jump into the palace surface: the curated object renders in the 3D palace.
  await page.getByTestId("flow-jump-palace").click();
  await expect(page.getByTestId("palace-surface")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("palace-error")).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId(`palace-object-${BULL_OX_OBJECT}`)).toBeAttached({
    timeout: 20_000,
  });

  // The object's full passage is reflected in the flow view: every stage
  // reached, no frontier action remains.
  await expect(page.getByTestId("flow-stage-timeline")).toHaveAttribute("data-reached", "true");
  await expect(page.getByTestId("flow-stage-places")).toHaveAttribute("data-reached", "true");
  await expect(page.getByTestId("flow-stage-stories")).toHaveAttribute("data-reached", "true");
  await expect(page.getByTestId("flow-stage-palace")).toHaveAttribute("data-reached", "true");
  await expect(page.getByTestId("flow-send-to-timeline")).toHaveCount(0);
  await expect(page.getByTestId("flow-locate")).toHaveCount(0);
  await expect(page.getByTestId("flow-add-to-story")).toHaveCount(0);
  await expect(page.getByTestId("flow-place-in-palace")).toHaveCount(0);

  // Fully offline from boot through the entire pipeline.
  expect(external).toEqual([]);
});
