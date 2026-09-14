import type { Canvas, CanvasView, EdgeLayout, JoinedCanvasNode, Viewport } from "../types";

export interface PersistCanvasViewInput {
  canvas: Canvas;
  nodes: JoinedCanvasNode[];
  edges: EdgeLayout[];
  viewport?: Viewport;
  appState?: Record<string, unknown>;
}

export interface CanvasRepository {
  listCanvases(constellationId: string): Promise<Canvas[]>;
  getCanvasView(input: { canvasId: string; lens?: "canvas" | "timeline" }): Promise<CanvasView>;
  persistCanvasView(input: PersistCanvasViewInput): Promise<void>;
}
