import { expect, test } from "@playwright/test";

test("opens the command palette and finds files, nodes, sequences, and commands", async ({
  page,
  browserName
}) => {
  test.skip(browserName !== "chromium", "desktop shortcut coverage runs in chromium");

  await page.goto("/");

  await page.getByRole("button", { name: "Add note node" }).click();
  await page.getByRole("button", { name: "Create sequence" }).click();

  await page.keyboard.press("Meta+K");

  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();

  const searchbox = palette.getByRole("textbox", { name: "Search workspace" });

  await searchbox.fill("resonance");
  await expect(
    palette.getByRole("button", { name: /episode-1-2-archetypal-resonance\.md file/i })
  ).toBeVisible();

  await searchbox.fill("opening");
  await expect(
    palette.getByRole("button", { name: /Opening note node/i })
  ).toBeVisible();

  await searchbox.fill("episode flow");
  await expect(
    palette.getByRole("button", { name: /Episode flow sequence/i })
  ).toBeVisible();

  await searchbox.fill("timeline");
  await expect(
    palette.getByRole("button", { name: /Go to Timeline command/i })
  ).toBeVisible();
});
