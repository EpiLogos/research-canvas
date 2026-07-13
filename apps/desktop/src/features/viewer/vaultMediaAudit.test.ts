import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("vault media audit", () => {
  it("audits real vault files, separates portable, remote and ephemeral references, and makes strict mode fail", () => {
    const root = mkdtempSync(join(tmpdir(), "research-canvas-media-audit-"));
    mkdirSync(join(root, "assets", "event"), { recursive: true });
    mkdirSync(join(root, "notes"), { recursive: true });
    writeFileSync(join(root, "assets", "event", "verified.png"), "png fixture");
    writeFileSync(join(root, "notes", "event.md"), [
      "![portable](assets/event/verified.png)",
      "![missing](assets/event/missing.png)",
      "![remote](https://images.example.test/event.png)",
      "![lost](blob:https://chatgpt.com/ephemeral)",
    ].join("\n"));

    const output = execFileSync(process.execPath, ["scripts/audit-vault-media.mjs", root], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    const report = JSON.parse(output) as {
      summary: Record<string, number>;
      localReferences: Array<{ reference: string; exists: boolean }>;
    };

    expect(report.summary).toMatchObject({
      localImageAssets: 1,
      localImageReferences: 2,
      remoteImageReferences: 1,
      ephemeralBlobReferences: 1,
      unresolvedImageReferences: 2,
    });
    expect(report.localReferences).toContainEqual({
      source: "notes/event.md",
      reference: "assets/event/verified.png",
      resolved: "assets/event/verified.png",
      exists: true,
      reason: null,
    });
    expect(() => execFileSync(process.execPath, ["scripts/audit-vault-media.mjs", root, "--strict"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: "pipe",
    })).toThrow();
  });
});
