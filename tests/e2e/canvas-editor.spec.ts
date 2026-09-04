import { expect, test } from "@playwright/test";
import { openProjectsBrowserView, waitForWorkspace } from "./support/canvas";

test.describe("T10 canvas editor", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForWorkspace(page);
    await openProjectsBrowserView(page);
    const rootConstellation = page.locator("[data-testid^='constellation-node-']", {
      hasText: "Root Archetypal Field",
    });
    await expect(rootConstellation).toBeAttached();
    await rootConstellation.dispatchEvent("click");
    const globalTab = page.getByTestId("app-tabbar").getByRole("tab", {
      name: "Root Archetypal Field",
    });
    await expect(globalTab).toBeVisible();
    await expect(globalTab).toHaveAttribute("aria-selected", "true");
    await waitForWorkspace(page);
    // Click an empty area of the canvas to focus the ReactFlow pane.
    const pane = page.locator(".react-flow__pane");
    await pane.click({ position: { x: 500, y: 300 }, force: true });
  });

  test("canvas toolbar and context menu render", async ({ page }) => {
    await expect(page.getByTestId("canvas-toolbar")).toBeVisible();
    await expect(page.getByTestId("canvas-toolbar").getByRole("button", { name: "Fit" })).toBeVisible();

    const pane = page.locator(".react-flow__pane");
    const paneBox = await pane.boundingBox();
    if (!paneBox) throw new Error("pane not found");
    const clientX = paneBox.x + paneBox.width / 2;
    const clientY = paneBox.y + paneBox.height / 2;
    await pane.dispatchEvent("contextmenu", { clientX, clientY, bubbles: true, cancelable: true, button: 2 });
    await page.screenshot({ path: "/tmp/canvas-editor-rightclick.png" });
    const menu = page.getByTestId("canvas-context-menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByText("Add note")).toBeVisible();
    await expect(menu.getByText("Add image")).toBeVisible();
    await expect(menu.getByText("Add group")).toBeVisible();
  });

  test("context menu creates a note node", async ({ page }) => {
    const pane = page.locator(".react-flow__pane");
    const paneBox = await pane.boundingBox();
    if (!paneBox) throw new Error("pane not found");
    const clientX = paneBox.x + paneBox.width / 2;
    const clientY = paneBox.y + paneBox.height / 2;
    await pane.dispatchEvent("contextmenu", { clientX, clientY, bubbles: true, cancelable: true, button: 2 });
    const menu = page.getByTestId("canvas-context-menu");
    await expect(menu).toBeVisible();
    await menu.getByText("Add note").click();
    await expect(page.locator("[data-testid^='note-node-']").first()).toBeVisible();
  });

  test("connecting two notes creates a RELATES_TO edge", async ({ page }) => {
    const pane = page.locator(".react-flow__pane");
    const paneBox = await pane.boundingBox();
    if (!paneBox) throw new Error("pane not found");
    const centerX = paneBox.x + paneBox.width / 2;
    const centerY = paneBox.y + paneBox.height / 2;

    // Create two notes side-by-side. Add note now uses the click location
    // as the flow-space position.
    await pane.dispatchEvent("contextmenu", { clientX: centerX - 300, clientY: centerY, bubbles: true, cancelable: true, button: 2 });
    await page.getByTestId("canvas-context-menu").getByText("Add note").click();

    await pane.dispatchEvent("contextmenu", { clientX: centerX + 300, clientY: centerY, bubbles: true, cancelable: true, button: 2 });
    await page.getByTestId("canvas-context-menu").getByText("Add note").click();

    const notes = page.locator(".react-flow__node-note");
    await expect(notes).toHaveCount(2);

    // Make handles visible and interactive for the connection gesture.
    await page.addStyleTag({ content: ".flow-handle { opacity: 1 !important; pointer-events: all !important; z-index: 10 !important; }" });

    const source = notes.first().locator("[data-handleid='source-right']");
    const target = notes.last().locator("[data-handleid='target-left']");

    // React Flow 12's connect-on-click works with real clicks in a browser, but
    // Playwright's pointer events do not reliably hit the tiny, scaled handles.
    // Dispatching click directly on the handle elements exercises the same
    // onConnect handler and creates the edge locally in the read-only E2E bridge.
    await source.dispatchEvent("click", { button: 0, bubbles: true, cancelable: true });
    await page.waitForTimeout(100);
    await target.dispatchEvent("click", { button: 0, bubbles: true, cancelable: true });

    const edge = page.locator("[data-testid^='edge-']").first();
    await expect(edge).toBeAttached();
    await expect(page.locator("text=RELATES_TO").first()).toBeVisible();
  });

  test("dropping a file-tree image entry creates an image node", async ({ page }) => {
    const pane = page.locator(".react-flow__pane");
    const paneBox = await pane.boundingBox();
    if (!paneBox) throw new Error("pane not found");
    const dropX = paneBox.x + paneBox.width / 2;
    const dropY = paneBox.y + paneBox.height / 2;

    const entry = JSON.stringify({
      id: "img-drop-1",
      kind: "image",
      name: "dropped-image.png",
      relativePath: "fixtures/dropped-image.png",
      absolutePath: "/fixtures/dropped-image.png",
    });

    const flow = page.locator(".react-flow");
    const flowElement = await flow.elementHandle();
    await flowElement?.evaluate(
      (element, { data, dropX, dropY }) => {
        const dataTransfer = new DataTransfer();
        dataTransfer.setData("application/x-canvas-entry", data);
        dataTransfer.effectAllowed = "copy";
        dataTransfer.dropEffect = "copy";
        const dragover = new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          clientX: dropX,
          clientY: dropY,
          dataTransfer,
        });
        element.dispatchEvent(dragover);
        const drop = new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          clientX: dropX,
          clientY: dropY,
          dataTransfer,
        });
        element.dispatchEvent(drop);
      },
      { data: entry, dropX, dropY },
    );

    const imageNodes = page.locator(".react-flow__node-image");
    await expect(imageNodes).toHaveCount(1);
  });

  test("connecting a note to an image creates a RELATES_TO edge", async ({ page }) => {
    const pane = page.locator(".react-flow__pane");
    const paneBox = await pane.boundingBox();
    if (!paneBox) throw new Error("pane not found");
    const centerX = paneBox.x + paneBox.width / 2;
    const centerY = paneBox.y + paneBox.height / 2;

    await pane.dispatchEvent("contextmenu", { clientX: centerX - 300, clientY: centerY, bubbles: true, cancelable: true, button: 2 });
    await page.getByTestId("canvas-context-menu").getByText("Add note").click();

    const entry = JSON.stringify({
      id: "img-drop-2",
      kind: "image",
      name: "dropped-image.png",
      relativePath: "fixtures/dropped-image.png",
      absolutePath: "/fixtures/dropped-image.png",
    });
    const flow = page.locator(".react-flow");
    const flowElement = await flow.elementHandle();
    await flowElement?.evaluate(
      (element, { data, dropX, dropY }) => {
        const dataTransfer = new DataTransfer();
        dataTransfer.setData("application/x-canvas-entry", data);
        dataTransfer.effectAllowed = "copy";
        dataTransfer.dropEffect = "copy";
        const dragover = new DragEvent("dragover", {
          bubbles: true,
          cancelable: true,
          clientX: dropX,
          clientY: dropY,
          dataTransfer,
        });
        element.dispatchEvent(dragover);
        const drop = new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
          clientX: dropX,
          clientY: dropY,
          dataTransfer,
        });
        element.dispatchEvent(drop);
      },
      { data: entry, dropX: centerX + 300, dropY: centerY },
    );

    const notes = page.locator(".react-flow__node-note");
    await expect(notes).toHaveCount(1);
    const images = page.locator(".react-flow__node-image");
    await expect(images).toHaveCount(1);

    await page.addStyleTag({ content: ".flow-handle { opacity: 1 !important; pointer-events: all !important; z-index: 10 !important; }" });

    const source = notes.first().locator("[data-handleid='source-right']");
    const target = images.first().locator("[data-handleid='target-left']");

    await source.dispatchEvent("click", { button: 0, bubbles: true, cancelable: true });
    await page.waitForTimeout(100);
    await target.dispatchEvent("click", { button: 0, bubbles: true, cancelable: true });

    const edge = page.locator("[data-testid^='edge-']").first();
    await expect(edge).toBeAttached();
    await expect(page.locator("text=RELATES_TO").first()).toBeVisible();
  });
});
