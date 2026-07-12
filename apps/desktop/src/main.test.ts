import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("desktop app entrypoint", () => {
  it("imports xterm's stylesheet so the terminal renderer is visible in the dock", () => {
    const mainPath = join(process.cwd(), "apps/desktop/src/main.tsx");
    const source = readFileSync(mainPath, "utf8");

    expect(source).toContain('import "@xterm/xterm/css/xterm.css";');
  });
});
