import { describe, expect, it } from "vitest";
import {
  buildBatchPlaceBody,
  buildPlaceNodeBody,
  buildUpdateLayoutBody,
} from "./payloads.js";

describe("research-canvas layout payload builders", () => {
  it("maps place-node camelCase args to snake_case body, dropping undefined", () => {
    expect(
      buildPlaceNodeBody({
        graphNodeId: "n-1",
        x: 10,
        y: 20,
        dotColour: "#4a4aff",
      }),
    ).toEqual({
      graph_node_id: "n-1",
      x: 10,
      y: 20,
      dot_colour: "#4a4aff",
    });
  });

  it("maps update-layout partial args, keeping only provided fields", () => {
    expect(
      buildUpdateLayoutBody({ graphNodeId: "n-2", width: 320 }),
    ).toEqual({ graph_node_id: "n-2", width: 320 });
  });

  it("maps batch placements preserving order", () => {
    expect(
      buildBatchPlaceBody({
        placements: [
          { graphNodeId: "a", x: 0, y: 0 },
          { graphNodeId: "b", x: 100, y: 0, width: 200 },
        ],
      }),
    ).toEqual({
      placements: [
        { graph_node_id: "a", x: 0, y: 0 },
        { graph_node_id: "b", x: 100, y: 0, width: 200 },
      ],
    });
  });
});
