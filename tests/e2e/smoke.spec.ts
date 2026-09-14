import { expect, test, type Page } from "@playwright/test";
import { waitForSeededGraphReady } from "./helpers/project";

const ROOT_PROJECT_NAME = "Root Archetypal Field";
const MEDICI = "root-archetypal-field:medici-template";
const BANDA = "root-archetypal-field:banda-genocide";

async function selectHistoricalForms(page: Page): Promise<void> {
  const rail = page.getByTestId("left-rail");
  const filesButton = rail.getByRole("button", { name: "Files & Constellation", exact: true });
  await filesButton.dispatchEvent("click");
  await expect(page.getByTestId("lo-project-scope-profile")).toBeAttached({ timeout: 35_000 });
  const constellations = page.getByTestId("lo-constellations");
  const historicalForms = constellations.getByRole("button", { name: /^Historical Forms\b/ });
  await expect(historicalForms).toBeAttached({ timeout: 20_000 });
  await historicalForms.dispatchEvent("click");
  await expect(historicalForms).toHaveAttribute("data-active", "true", { timeout: 20_000 });
  await filesButton.click();
  await expect(page.getByTestId("shell-left-sidebar")).toHaveAttribute("data-open", "false");
}

async function attachCanonicalBandaPlace(page: Page): Promise<void> {
  await page.evaluate(async ({ graphNodeId }) => {
    const sessionId = document.cookie
      .split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith("research_canvas_session_id="))
      ?.slice("research_canvas_session_id=".length);
    if (!sessionId) throw new Error("research-canvas browser session cookie was not established");

    const response = await fetch("http://127.0.0.1:4789/graph/node/update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Research-Canvas-Session": sessionId,
      },
      body: JSON.stringify({
        graphNodeId,
        patch: {
          placeCoverage: "resolved",
          place: {
            graphNodeId,
            names: [{ language: "en", name: "Banda Islands" }],
            coordinate: {
              precision: "approximate",
              latitude: -4.55,
              longitude: 129.9,
            },
            hierarchy: [],
            externalRefs: [],
            provenance: { sourceRefs: [] },
          },
        },
      }),
    });
    if (!response.ok) {
      throw new Error(`local Place update failed (${response.status}): ${await response.text()}`);
    }
  }, { graphNodeId: BANDA });
}

test("all six surfaces render real project data through the canonical browser bridge", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await waitForSeededGraphReady(page);

  const rail = page.getByTestId("left-rail");

  // Surface #0 · Projects: the repository-backed project tree exposes the
  // canonical root rather than a shell-only placeholder.
  const projectsButton = rail.getByRole("button", { name: "Projects", exact: true });
  await projectsButton.click();
  const projectSurface = page.getByTestId("left-mode-projects");
  await expect(projectSurface).toBeVisible({ timeout: 20_000 });
  await expect(projectSurface).toContainText(ROOT_PROJECT_NAME);
  await expect(projectSurface.getByRole("treeitem").first()).toBeAttached();
  await projectsButton.click();
  await expect(page.getByTestId("shell-left-sidebar")).toHaveAttribute("data-open", "false");

  // Surface #1 · Canvas: real graph substance is already materialized by the
  // browser bridge and rendered into the canonical Canvas.
  await expect(page.getByTestId("canvas-pane")).toBeVisible();
  await expect(page.locator(".canvas-flow")).toContainText("Christ Sixfold Spectral Lineage");

  // Surface #5 · Palace: the root graph yields real clustered chambers and
  // placeable objects. The mature Palace spec separately owns pixel/camera
  // proof; this is the cross-surface data-path smoke.
  await page.getByTestId("lens-palace").click();
  await expect(page.getByTestId("palace-surface")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId("palace-chambers").locator("li")).not.toHaveCount(0);
  await expect(page.getByTestId("palace-objects").locator("li")).not.toHaveCount(0);

  // Historical Forms is the existing canonical constellation with the dated
  // material used by the mature Timeline and Story acceptance tests.
  await selectHistoricalForms(page);

  // Surface #2 · Timeline: a canonical historical node is read through the
  // Timeline repository and appears in the active constellation walk.
  await page.getByTestId("lens-timeline").click();
  await expect(page.getByTestId("timeline-surface")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId(`timeline-node-${MEDICI}`)).toBeAttached({ timeout: 20_000 });
  await expect(page.getByTestId("timeline-walk-stops").locator("li")).not.toHaveCount(0);

  // Surface #4 · Story: no production migration story is auto-seeded. Create
  // one real journey through DesktopStoryRepository and verify the durable
  // repository result is returned into the Story surface.
  await page.getByTestId("lens-story").click();
  await expect(page.getByTestId("story-surface")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId("story-loading")).toHaveCount(0, { timeout: 20_000 });
  const journeyTitle = `T16 smoke journey ${Date.now()}`;
  await page.getByTestId("story-new-journey-title").fill(journeyTitle);
  await page.getByTestId("story-create-journey").click();
  await expect(
    page.getByTestId("story-journey-list").getByRole("button", { name: new RegExp(journeyTitle) }),
  ).toBeVisible({ timeout: 20_000 });

  // Surface #3 · Places: enrich an existing canonical graph node through the
  // ordinary local metadata command, then prove the project-wide Places
  // repository discovers and renders that same node as a real globe marker.
  await attachCanonicalBandaPlace(page);
  await page.getByTestId("lens-psychogeographic").click();
  await expect(page.getByTestId("places-globe")).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId(`globe-marker-${BANDA}`)).toBeVisible({ timeout: 25_000 });

  await expect(page.getByTestId("shell-stage")).toBeVisible();
  await expect(page.getByTestId("status-strip")).toContainText("synced");
});
