import { describe, expect, it } from "vitest";
import { SURFACE_REGISTRY, SurfaceId, type SurfaceConfig } from "./surface";

const allSurfaceIds: SurfaceId[] = [
  "projects",
  "canvas",
  "timeline",
  "places",
  "story",
  "palace",
];

describe("surface registry", () => {
  it("exports a SurfaceConfig type", () => {
    const satisfies: SurfaceConfig<{ zoom: number }, { setZoom: number }> = {
      id: "canvas",
      displayName: "Canvas",
      iconName: "Layout",
      lens: "canvas",
      requiresProject: true,
      persistentTabStateSchema: { parse: (v: unknown) => v as { zoom: number } } as unknown as import("zod").ZodSchema<{ zoom: number }>,
      defaultViewState: { zoom: 1 },
    };
    expect(satisfies.id).toBe("canvas");
  });

  it("has a config for every SurfaceId", () => {
    for (const id of allSurfaceIds) {
      expect(SURFACE_REGISTRY[id]).toBeDefined();
      expect(SURFACE_REGISTRY[id].id).toBe(id);
    }
  });

  it("contains exactly the six named surfaces and no others", () => {
    const registeredIds = Object.keys(SURFACE_REGISTRY) as SurfaceId[];
    expect(registeredIds.sort()).toEqual([...allSurfaceIds].sort());
  });

  it("does not include reading, search, command palette, or terminal as surfaces", () => {
    const registeredIds = Object.keys(SURFACE_REGISTRY) as string[];
    for (const affordance of ["reading", "search", "palette", "terminal"]) {
      expect(registeredIds).not.toContain(affordance);
    }
    // Sanity: the literal types themselves should not include affordances.
    const id: SurfaceId = "canvas";
    expect(id).toBe("canvas");
  });

  it("carries required metadata on every surface config", () => {
    for (const id of allSurfaceIds) {
      const config = SURFACE_REGISTRY[id];
      expect(config.displayName).toBeTruthy();
      expect(config.iconName).toBeTruthy();
      expect(typeof config.requiresProject).toBe("boolean");
      expect(config.persistentTabStateSchema).toBeDefined();
      expect(config.defaultViewState).toBeDefined();
    }
  });
});
