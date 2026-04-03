import { expect, test } from "@playwright/test";

import { expectNoCanvasError, waitForWorkspace } from "./support/canvas";

test("edits an edge relation label and restores it after reload", async ({ page, context }) => {
  await page.goto("/");
  await waitForWorkspace(page);
  await page.evaluate(async () => {
    const bridgeBaseUrl = "http://127.0.0.1:4789";
    const sessionId = document.cookie
      .split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith("research_canvas_session_id="))
      ?.slice("research_canvas_session_id=".length);

    if (!sessionId) {
      throw new Error("Expected research canvas browser session cookie");
    }

    const headers = {
      "X-Research-Canvas-Session": sessionId,
    };

    const bootstrap = await fetch(`${bridgeBaseUrl}/workspace/bootstrap`, { headers }).then(
      (response) => response.json(),
    );
    const doc = await fetch(`${bridgeBaseUrl}/workspace/project/${bootstrap.activeProjectId}`, {
      headers,
    }).then((response) => response.json());
    const readme = doc.entries.find(
      (entry: {
        absolutePath: string;
        isDirectory: boolean;
        kind: string;
        name: string;
        relativePath: string;
      }) => !entry.isDirectory && entry.name === "README.md",
    );

    if (!readme) {
      throw new Error("Expected README.md fixture entry");
    }

    const now = new Date().toISOString();
    const noteId = crypto.randomUUID();
    const resourceId = crypto.randomUUID();
    const edgeId = crypto.randomUUID();

    const response = await fetch(`${bridgeBaseUrl}/workspace/project/${bootstrap.activeProjectId}/persist`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({
        annotations: doc.annotations,
        canvasId: doc.canvasId,
        databasePath: doc.databasePath,
        edges: [
          ...doc.edges,
          {
            canvasId: doc.canvasId,
            createdAt: now,
            directionality: "forward",
            id: edgeId,
            label: "reference",
            note: "",
            relationKind: "reference",
            sourceHandleId: "source-right",
            sourceNodeId: noteId,
            style: {
              dashed: false,
              stroke: "#f0b45a",
              width: 2,
            },
            targetHandleId: "target-left",
            targetNodeId: resourceId,
            updatedAt: now,
          },
        ],
        nodes: [
          ...doc.nodes,
          {
            canvasId: doc.canvasId,
            content: "",
            createdAt: now,
            id: noteId,
            position: { x: 280, y: 160 },
            size: { width: 240, height: 160 },
            summary: "",
            tags: ["note"],
            title: "Untitled note",
            type: "note",
            updatedAt: now,
          },
          {
            absolutePath: readme.absolutePath,
            canvasId: doc.canvasId,
            createdAt: now,
            fileFingerprint: `markdown:${readme.relativePath}`,
            id: resourceId,
            mimeType: "text/markdown",
            position: { x: 620, y: 160 },
            relativePath: readme.relativePath,
            resourceKind: "markdown",
            size: { width: 260, height: 180 },
            summary: readme.relativePath,
            title: readme.name,
            type: "resource",
            updatedAt: now,
          },
        ],
        projectId: bootstrap.activeProjectId,
        sequenceSteps: doc.sequenceSteps,
        sequences: doc.sequences,
      }),
    });

    if (!response.ok) {
      throw new Error(`Persist failed with status ${response.status}`);
    }
  });

  const seededPage = await context.newPage();
  await seededPage.goto("/");
  await waitForWorkspace(seededPage);

  const label = seededPage.locator(".flow-edge-label").first();
  await expect(label).toContainText("reference");

  await label.click();
  const input = seededPage.getByLabel("Relation label");
  await expect(input).toBeVisible();
  await input.fill("supports");
  await input.press("Enter");
  await expect(input).toHaveValue("supports");

  await seededPage.reload();
  await waitForWorkspace(seededPage);
  await expect(seededPage.locator(".flow-edge-label").first()).toContainText("supports");
  await expectNoCanvasError(seededPage);
});
