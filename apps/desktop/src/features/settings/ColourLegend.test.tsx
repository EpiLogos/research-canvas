import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { COLOUR_TAGS, labelForTag } from "@research-canvas/schema";

import { ColourLegend } from "./ColourLegend";

describe("ColourLegend", () => {
  it("renders the legend panel", () => {
    render(<ColourLegend theme="paper" />);
    expect(screen.getByTestId("colour-legend")).toBeInTheDocument();
  });

  it("renders every colour tag with a swatch and label", () => {
    render(<ColourLegend theme="nocturne" />);

    for (const tag of COLOUR_TAGS) {
      const item = screen.getByTestId(`colour-legend-${tag}`);
      expect(item).toBeInTheDocument();
      expect(item).toHaveTextContent(labelForTag(tag));

      const swatch = item.querySelector('[data-testid="colour-swatch"]');
      expect(swatch).toBeInTheDocument();
    }
  });

  it("renders the expected number of swatches", () => {
    render(<ColourLegend theme="ledger" />);
    expect(screen.getAllByTestId("colour-swatch")).toHaveLength(COLOUR_TAGS.length);
  });
});
