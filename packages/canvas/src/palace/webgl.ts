/**
 * WebGL2 capability probe (refinement-2 D5.1): the 3D palace requires WebGL2
 * with real rendering. Before mounting the three.js scene graph we probe the
 * capability and surface a clear error state when it is unavailable (software
 * rendering, headless CI without WebGL, etc.). The probe is dependency-injectable
 * so it is unit-testable in jsdom, where `canvas.getContext("webgl2")` returns
 * `null` and the probe therefore reports "unsupported" deterministically.
 */

export interface WebGlCapability {
  supported: boolean;
  /** The unmasked GPU renderer string when available (diagnostics only). */
  renderer: string | null;
  /** A human-readable reason when `supported` is false. */
  error: string | null;
}

/** The subset of WebGL2RenderingContext the probe touches. */
export interface WebGl2ContextLike {
  getExtension?(name: string): { UNMASKED_RENDERER_WEBGL?: number } | null;
  getParameter?(parameter: number): unknown;
}

export interface CanvasLike {
  getContext(contextId: string, options?: unknown): unknown | null;
}

export interface WebGlProbeDeps {
  /** Factory for the probe canvas (browser default: `document.createElement`). */
  createCanvas?: () => CanvasLike;
  /** Pre-computed context result (for tests). */
  webgl2Context?: WebGl2ContextLike | null;
}

const UNMASKED_RENDERER_WEBGL = 0x9246;

export function probeWebGl2(deps: WebGlProbeDeps = {}): WebGlCapability {
  if (typeof document === "undefined" && !deps.createCanvas) {
    return {
      supported: false,
      renderer: null,
      error: "WebGL2 is only available in a browser context",
    };
  }
  const create = deps.createCanvas ?? (() => document.createElement("canvas"));
  const canvas = create();
  const gl =
    deps.webgl2Context !== undefined
      ? deps.webgl2Context
      : (canvas.getContext("webgl2", {
          failIfMajorPerformanceCaveat: false,
        }) as WebGl2ContextLike | null);
  // A truthy context is not enough: some environments (and the jsdom test
  // harness) return a 2D context for any context id. A genuine WebGL2 context
  // always exposes `getParameter` (a 2D context never does).
  if (!gl || typeof gl.getParameter !== "function") {
    return {
      supported: false,
      renderer: null,
      error: "WebGL2 is not supported by this browser or device",
    };
  }
  let renderer: string | null = null;
  try {
    const debugInfo = gl.getExtension?.("WEBGL_debug_renderer_info");
    if (debugInfo && gl.getParameter) {
      const value = gl.getParameter(
        debugInfo.UNMASKED_RENDERER_WEBGL ?? UNMASKED_RENDERER_WEBGL,
      );
      renderer = typeof value === "string" && value.length > 0 ? value : null;
    }
  } catch {
    renderer = null;
  }
  return { supported: true, renderer, error: null };
}
