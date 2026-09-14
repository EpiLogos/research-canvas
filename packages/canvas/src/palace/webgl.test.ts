import { describe, expect, test } from "vitest";

import { probeWebGl2 } from "./webgl";

describe("probeWebGl2", () => {
  test("reports unsupported in jsdom (no WebGL2 context)", () => {
    const result = probeWebGl2();
    expect(result.supported).toBe(false);
    expect(result.error).toContain("WebGL2");
  });

  test("reports unsupported when getContext returns null", () => {
    const result = probeWebGl2({
      createCanvas: () => ({ getContext: () => null }),
    });
    expect(result.supported).toBe(false);
    expect(result.error).not.toBeNull();
  });

  test("reports supported when a WebGL2 context is present", () => {
    const result = probeWebGl2({
      createCanvas: () => ({ getContext: () => ({ getParameter: () => null }) }),
      webgl2Context: { getParameter: () => null },
    });
    expect(result.supported).toBe(true);
    expect(result.error).toBeNull();
  });

  test("rejects a 2D-context masquerading as WebGL2", () => {
    // The vitest harness returns a 2D context for any context id; it lacks
    // `getParameter`, so the probe must reject it.
    const result = probeWebGl2();
    expect(result.supported).toBe(false);
  });

  test("extracts the unmasked renderer string for diagnostics", () => {
    const result = probeWebGl2({
      webgl2Context: {
        getExtension(name: string) {
          if (name === "WEBGL_debug_renderer_info") {
            return { UNMASKED_RENDERER_WEBGL: 0x9246 };
          }
          return null;
        },
        getParameter(parameter: number) {
          return parameter === 0x9246 ? "SwiftShader GPU" : null;
        },
      },
    });
    expect(result.supported).toBe(true);
    expect(result.renderer).toBe("SwiftShader GPU");
  });

  test("never throws on a hostile context", () => {
    const result = probeWebGl2({
      webgl2Context: {
        getExtension() {
          throw new Error("boom");
        },
        getParameter() {
          throw new Error("boom");
        },
      } as never,
    });
    expect(result.supported).toBe(true);
    expect(result.renderer).toBeNull();
  });
});
