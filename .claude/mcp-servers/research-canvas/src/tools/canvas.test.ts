import { describe, expect, it } from "vitest";
import { canvasTools } from "./canvas.js";

describe("slimmed canvasTools", () => {
  it("exposes exactly the layout-only tools", () => {
    expect(canvasTools.map((t) => t.name).sort()).toEqual([
      "canvas_batch_place",
      "canvas_get_state",
      "canvas_place_node",
      "canvas_remove_node",
      "canvas_update_layout",
    ]);
  });

  it("does not expose any theory-write tools", () => {
    const names = canvasTools.map((t) => t.name);
    for (const banned of [
      "canvas_create_node",
      "canvas_update_node",
      "canvas_delete_node",
      "canvas_create_edge",
      "canvas_delete_edge",
      "canvas_batch_create",
    ]) {
      expect(names).not.toContain(banned);
    }
  });

  it("requires graphNodeId on place_node", () => {
    const place = canvasTools.find((t) => t.name === "canvas_place_node");
    expect(place?.inputSchema.required).toEqual(["graphNodeId", "x", "y"]);
  });
});
