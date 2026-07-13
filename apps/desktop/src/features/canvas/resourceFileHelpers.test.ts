import { afterEach, describe, expect, it, vi } from "vitest";

import {
  deriveResourceImportPlan,
  resolveBlockNoteAssetUrls,
  restoreBlockNoteAssetUrls,
  resolveWorkspaceAssetUrl,
  toAssetUrl,
} from "./resourceFileHelpers";

afterEach(() => {
  Reflect.deleteProperty(globalThis, "isTauri");
  Reflect.deleteProperty(globalThis, "__TAURI_INTERNALS__");
});

describe("deriveResourceImportPlan", () => {
  it("keeps files inside an existing resource root relative to that root", () => {
    const plan = deriveResourceImportPlan({
      absolutePath: "/workspace/project/assets/reference/cover.png",
      resourceRoots: ["/workspace/project/assets"],
    });

    expect(plan.rootPath).toBe("/workspace/project/assets");
    expect(plan.relativePath).toBe("reference/cover.png");
    expect(plan.shouldAttachRoot).toBe(false);
    expect(plan.kind).toBe("image");
  });

  it("attaches the parent folder when the selected image lives outside known roots", () => {
    const plan = deriveResourceImportPlan({
      absolutePath: "/external/library/posters/hero.jpg",
      resourceRoots: ["/workspace/project/assets"],
    });

    expect(plan.rootPath).toBe("/external/library/posters");
    expect(plan.relativePath).toBe("hero.jpg");
    expect(plan.shouldAttachRoot).toBe(true);
    expect(plan.kind).toBe("image");
  });
});

describe("workspace asset URLs", () => {
  it("keeps the leading filesystem slash encoded in its non-Tauri fallback", () => {
    expect(toAssetUrl("/workspace/project/assets/n1/cat.png")).toBe(
      "asset://localhost/%2Fworkspace%2Fproject%2Fassets%2Fn1%2Fcat.png",
    );
  });

  it("delegates local URLs to Tauri's native asset URL converter when embedded", () => {
    const convertFileSrc = vi.fn((path: string) => `native-asset:${path}`);
    Object.assign(globalThis, {
      isTauri: true,
      __TAURI_INTERNALS__: { convertFileSrc },
    });

    expect(toAssetUrl("/workspace/project/assets/n1/cat.png")).toBe(
      "native-asset:/workspace/project/assets/n1/cat.png",
    );
    expect(convertFileSrc).toHaveBeenCalledWith("/workspace/project/assets/n1/cat.png", "asset");
  });

  it("resolves a persisted workspace-relative image URL through Tauri's asset protocol", () => {
    expect(resolveWorkspaceAssetUrl("assets/n1/diagrams/field image.png", "/workspace/project")).toBe(
      "asset://localhost/%2Fworkspace%2Fproject%2Fassets%2Fn1%2Fdiagrams%2Ffield%20image.png",
    );
  });

  it("keeps remote and already-resolved URLs intact", () => {
    expect(resolveWorkspaceAssetUrl("https://example.test/image.png", "/workspace/project")).toBe(
      "https://example.test/image.png",
    );
    expect(resolveWorkspaceAssetUrl("asset://localhost/workspace/project/assets/n1/image.png", "/workspace/project")).toBe(
      "asset://localhost/%2Fworkspace%2Fproject%2Fassets%2Fn1%2Fimage.png",
    );
    expect(resolveWorkspaceAssetUrl("C:\\archive\\image.png", "/workspace/project")).toBe(
      "asset://localhost/C%3A%2Farchive%2Fimage.png",
    );
  });

  it("renders stored BlockNote image paths locally without replacing their portable stored form", () => {
    const stored = JSON.stringify([
      { type: "image", props: { url: "assets/n1/cat.png", caption: "A cat" } },
      { type: "paragraph", content: [{ type: "text", text: "Context" }] },
    ]);

    const display = resolveBlockNoteAssetUrls(stored, "/workspace/project");
    expect(JSON.parse(display)[0].props.url).toBe(
      "asset://localhost/%2Fworkspace%2Fproject%2Fassets%2Fn1%2Fcat.png",
    );
    expect(restoreBlockNoteAssetUrls(display, "/workspace/project")).toBe(stored);
  });
});
