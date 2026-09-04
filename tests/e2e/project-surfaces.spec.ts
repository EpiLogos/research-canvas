import { expect, test, type Page } from "@playwright/test";

/**
 * Task-10 acceptance gate: the left sidebar is project-scoped. The active
 * project (the seeded root constellation after boot) drives every left-rail
 * surface — Files/Constellations, Search, Annotations — with REAL seeded data,
 * and selecting a project from the projects-layer picker routes each surface
 * to the new project's scope through the REAL browser bridge seam
 * (resolveOrCreateHome → createProject → selectProject). Fully offline.
 *
 * Mirrors the pipeline.spec.ts pattern: the hostname-filtered network audit is
 * registered BEFORE page.goto and asserted empty at the end — nothing leaves
 * the machine except localhost (Vite 4173 + terminal bridge 4789).
 */

const ROOT_PROJECT_NAME = "Root Archetypal Field";
const ROOT_PROJECT_SCOPE = "bootstrapping";
const NEW_PROJECT_NAME = "Task 10 E2E Project";
const NEW_PROJECT_SLUG = "task-10-e2e-project";

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

test("project selection drives every left-rail surface with real seeded data, fully offline", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const external = await collectExternalRequests(page);

  await page.goto("/");
  await expect(page.getByTestId("canvas-pane")).toBeVisible({ timeout: 20_000 });

  // Rail verbs are scoped to the icon strip: constellation rows also carry
  // accessible names whose text can contain substrings of a rail verb
  // (e.g. "reSEARCH vault"), so `exact` + left-rail scoping keeps the lookup
  // unambiguous.
  const rail = page.getByTestId("left-rail");
  const railVerb = (name: string) =>
    rail.getByRole("button", { name, exact: true });

  // ---- 1. FILES SURFACE: the active project (seeded root constellation)
  // scopes the files/constellations browser with real seeded data. ----
  await railVerb("Files & Constellation").dispatchEvent("click");
  const overlay = page.getByTestId("left-overlay");
  await expect(overlay).toHaveAttribute("data-open", "true");
  await expect(overlay).toHaveAttribute("data-left-mode", "files");

  // The project-scope banner shows the real seeded identity.
  await expect(page.getByTestId("lo-project-scope")).toBeVisible();
  await expect(page.getByTestId("lo-project-scope-name")).toContainText(ROOT_PROJECT_NAME);
  await expect(page.getByTestId("lo-project-scope-profile")).toContainText(ROOT_PROJECT_SCOPE);

  // Real seeded constellations render as a hierarchy, not a dead panel.
  const constellations = page.getByTestId("lo-constellations");
  await expect(
    constellations.locator(".lo-constellation-item", { hasText: ROOT_PROJECT_NAME }),
  ).toBeAttached();
  await expect(
    constellations.locator(".lo-constellation-item", { hasText: "Dual Animal Quaternity" }),
  ).toBeAttached();

  // Real seeded graph nodes render in the browser (grouped graph view).
  await expect(page.getByTestId("browser-graph")).toHaveAttribute("data-active", "true");
  await expect(page.locator(".lo-file-row", { hasText: "Root Ecology" }).first()).toBeAttached();

  // ---- 2. SEARCH SURFACE: project-scoped search over the seeded corpus. ----
  await railVerb("Search").dispatchEvent("click");
  await expect(overlay).toHaveAttribute("data-left-mode", "search");
  await expect(page.getByTestId("search-panel")).toBeVisible();
  await page.getByPlaceholder("Search nodes, files...").fill("archetypal");
  await expect(
    page.locator(".search-panel__hit-title", { hasText: ROOT_PROJECT_NAME }).first(),
  ).toBeVisible({ timeout: 15_000 });

  // ---- 3. ANNOTATIONS SURFACE: project-scoped annotations panel renders. ----
  await railVerb("Annotations").dispatchEvent("click");
  await expect(overlay).toHaveAttribute("data-left-mode", "annotations");
  await expect(page.getByTestId("annotations-panel")).toBeVisible();
  await expect(page.locator(".annotations-panel__draw-btn")).toBeAttached();

  // ---- 4. PROJECT SELECTION → SURFACE ROUTING through the real seam.
  // Open the projects layer and create+select a real project under the home. ----
  await page.getByTestId("projects-trigger").dispatchEvent("click");
  await expect(page.getByTestId("projects-layer")).toBeVisible();
  await page.getByTestId("projects-new-name").fill(NEW_PROJECT_NAME);
  await page.getByTestId("projects-create").dispatchEvent("click");

  // The picker closes after selection and every surface re-scopes to the new
  // project through the real transport (createProject → selectProject).
  await expect(page.getByTestId("projects-layer")).not.toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("lo-project-scope-name")).toContainText(NEW_PROJECT_NAME, {
    timeout: 15_000,
  });
  await expect(page.getByTestId("lo-project-scope-profile")).toContainText(
    `project:${NEW_PROJECT_SLUG}`,
  );

  // The other left-rail surfaces still route for the newly active project.
  await railVerb("Search").dispatchEvent("click");
  await expect(overlay).toHaveAttribute("data-left-mode", "search");
  await expect(page.getByTestId("search-panel")).toBeVisible();

  await railVerb("Annotations").dispatchEvent("click");
  await expect(overlay).toHaveAttribute("data-left-mode", "annotations");
  await expect(page.getByTestId("annotations-panel")).toBeVisible();

  // Return to the files surface: the banner still reflects the new project.
  await railVerb("Files & Constellation").dispatchEvent("click");
  await expect(overlay).toHaveAttribute("data-left-mode", "files");
  await expect(page.getByTestId("lo-project-scope-name")).toContainText(NEW_PROJECT_NAME);

  // Fully offline from boot through the entire surface-routing flow.
  expect(external).toEqual([]);
});
