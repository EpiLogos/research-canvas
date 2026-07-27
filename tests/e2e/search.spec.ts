import { expect, test } from "@playwright/test";
import { waitForWorkspace } from "./support/canvas";

test("opens the command palette and finds files, nodes, sequences, and commands", async ({
  page,
  browserName
}) => {
  test.skip(browserName !== "chromium", "desktop shortcut coverage runs in chromium");

  await page.goto("/");
  await waitForWorkspace(page);

  await page.getByRole("button", { name: "Do anything" }).click();

  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();

  const searchbox = palette.getByRole("textbox", { name: "Search workspace" });

  await searchbox.fill("resonance");
  await expect(
    palette.getByRole("button", { name: /episode-1-2-archetypal-resonance\.md file/i })
  ).toBeVisible();

  await searchbox.fill("Christ Sixfold");
  await expect(
    palette.getByRole("button", { name: /Christ Sixfold Spectral Lineage node/i })
  ).toBeVisible();

  await searchbox.fill("create note");
  await expect(palette.getByRole("button", { name: /Create note command/i })).toBeVisible();

  await searchbox.fill("timeline");
  await expect(
    palette.getByRole("button", { name: /Go to Timeline command/i })
  ).toBeVisible();
});
