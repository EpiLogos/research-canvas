import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ResonancePopover } from "./ResonancePopover";
import type { GraphNode, LitInstance } from "./contracts";

function op(id: string, title: string): GraphNode {
  return {
    graphNodeId: id,
    entityType: "Archetype",
    title,
    body: "[]",
    summary: "",
    archetypalResonance: null,
    coordinate: null,
    sourceCoordinates: [],
    isTemporal: false,
    validFrom: null,
    validTo: null,
    temporalPrecision: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("ResonancePopover", () => {
  test("empty state when no resonances", () => {
    render(<ResonancePopover resonances={[]} onLightOperator={() => {}} />);
    expect(screen.getByTestId("resonance-empty")).toBeInTheDocument();
  });

  test("lists operators and flags the dominant one", () => {
    const resonances: LitInstance[] = [
      { node: op("monopoly", "Monopoly mechanism"), relType: "INSTANTIATES", dominance: "dominant" },
      { node: op("wolf", "Dog/Wolf"), relType: "ECHOES", dominance: "secondary" },
    ];
    render(<ResonancePopover resonances={resonances} onLightOperator={() => {}} />);
    expect(screen.getByText("Monopoly mechanism")).toBeInTheDocument();
    expect(screen.getByText("Dog/Wolf")).toBeInTheDocument();
    expect(screen.getByTestId("resonance-row-monopoly").dataset.dominant).toBe("true");
    expect(screen.getByTestId("resonance-row-wolf").dataset.dominant).toBeUndefined();
  });

  test("clicking a row lights that operator", () => {
    const onLightOperator = vi.fn();
    const resonances: LitInstance[] = [
      { node: op("monopoly", "Monopoly mechanism"), relType: "INSTANTIATES", dominance: "dominant" },
    ];
    render(<ResonancePopover resonances={resonances} onLightOperator={onLightOperator} />);
    fireEvent.click(screen.getByTestId("resonance-row-monopoly"));
    expect(onLightOperator).toHaveBeenCalledWith("monopoly");
  });
});
