import { describe, expect, it } from "vitest";

import { deriveResourceImportPlan } from "./resourceFileHelpers";

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
