import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { PipelineStageId } from "../features/pipeline/pipelineStages";
import { PipelineRail } from "./PipelineRail";

const ZERO_COUNTS: Record<PipelineStageId, number> = {
  constellations: 0,
  timeline: 0,
  places: 0,
  stories: 0,
  palace: 0,
};

describe("PipelineRail", () => {
  it("renders the five lens tabs in pipeline order with the active one marked", () => {
    render(
      <PipelineRail
        lens="timeline"
        onSetLens={() => {}}
        onOpenPalette={() => {}}
        stageCounts={ZERO_COUNTS}
      />,
    );
    expect(screen.getByTestId("lens-canvas")).toHaveAttribute("data-active", "false");
    expect(screen.getByTestId("lens-timeline")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("lens-psychogeographic")).toHaveAttribute("data-active", "false");
    expect(screen.getByTestId("lens-story")).toHaveAttribute("data-active", "false");
    expect(screen.getByTestId("lens-palace")).toHaveAttribute("data-active", "false");
    expect(screen.queryByTestId("lens-reading")).not.toBeInTheDocument();
  });

  it("labels the story stage Journeys and the constellation stage Canvas", () => {
    render(
      <PipelineRail
        lens="story"
        onSetLens={() => {}}
        onOpenPalette={() => {}}
        stageCounts={ZERO_COUNTS}
      />,
    );
    expect(screen.getByTestId("lens-story")).toHaveTextContent("Journeys");
    expect(screen.getByRole("tab", { name: "Journeys" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Canvas" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Timeline" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Places" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Palace" })).toBeInTheDocument();
  });

  it("calls onSetLens when a lens is clicked", () => {
    const onSetLens = vi.fn();
    render(
      <PipelineRail
        lens="canvas"
        onSetLens={onSetLens}
        onOpenPalette={() => {}}
        stageCounts={ZERO_COUNTS}
      />,
    );
    fireEvent.click(screen.getByTestId("lens-timeline"));
    expect(onSetLens).toHaveBeenCalledWith("timeline");
    fireEvent.click(screen.getByTestId("lens-story"));
    expect(onSetLens).toHaveBeenCalledWith("story");
  });

  it("calls onOpenPalette from the palette affordance", () => {
    const onOpenPalette = vi.fn();
    render(
      <PipelineRail
        lens="canvas"
        onSetLens={() => {}}
        onOpenPalette={onOpenPalette}
        stageCounts={ZERO_COUNTS}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Do anything" }));
    expect(onOpenPalette).toHaveBeenCalledTimes(1);
  });

  it("shows the breadcrumb text when provided", () => {
    render(
      <PipelineRail
        lens="canvas"
        onSetLens={() => {}}
        onOpenPalette={() => {}}
        breadcrumb="The Naked Face"
        stageCounts={ZERO_COUNTS}
      />,
    );
    expect(screen.getByText("The Naked Face")).toBeInTheDocument();
  });

  it("renders stage-state counts as badges without affecting the tab label", () => {
    render(
      <PipelineRail
        lens="canvas"
        onSetLens={() => {}}
        onOpenPalette={() => {}}
        stageCounts={{
          constellations: 3,
          timeline: 2,
          places: 1,
          stories: 1,
          palace: 0,
        }}
      />,
    );
    expect(screen.getByTestId("rail-count-constellations")).toHaveTextContent("3");
    expect(screen.getByTestId("rail-count-timeline")).toHaveTextContent("2");
    expect(screen.getByTestId("rail-count-places")).toHaveTextContent("1");
    expect(screen.getByTestId("rail-count-stories")).toHaveTextContent("1");
    expect(screen.queryByTestId("rail-count-palace")).not.toBeInTheDocument();
    // Badges are aria-hidden so the tab's accessible name stays the label.
    expect(screen.getByRole("tab", { name: "Journeys" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Canvas" })).toBeInTheDocument();
  });
});
