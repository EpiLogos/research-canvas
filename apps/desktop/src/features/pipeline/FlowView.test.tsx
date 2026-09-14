import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ObjectStageState } from "./pipelineStages";
import { FlowView } from "./FlowView";
import type { UsePipelineActionsResult } from "./usePipelineActions";

const bandGenocide = "root-archetypal-field:banda-genocide";
const placeBanda = "root-archetypal-field:place-banda-islands";

const node = {
  graphNodeId: bandGenocide,
  title: "Banda genocide",
  canvasNodeType: "note",
  entityType: "Event",
};

const places = [{ graphNodeId: placeBanda, title: "Banda Islands" }];

function fakeActions(): UsePipelineActionsResult {
  return {
    sendToTimeline: vi.fn().mockResolvedValue(undefined),
    locate: vi.fn().mockResolvedValue(undefined),
    addToStory: vi.fn().mockResolvedValue(undefined),
    placeInPalace: vi.fn().mockResolvedValue(undefined),
  };
}

function stateAt(flags: Partial<ObjectStageState>): ObjectStageState {
  return {
    graphNodeId: bandGenocide,
    title: "Banda genocide",
    timeline: false,
    places: false,
    stories: false,
    palace: false,
    ...flags,
  };
}

async function clickAndSettle(testId: string) {
  await act(async () => {
    fireEvent.click(screen.getByTestId(testId));
  });
}

describe("FlowView", () => {
  it("renders the five pipeline stages with the frontier marked", () => {
    render(
      <FlowView
        node={node}
        stageState={stateAt({})}
        candidatePlaces={places}
        actions={fakeActions()}
        onJump={() => {}}
      />,
    );
    for (const stage of ["constellations", "timeline", "places", "stories", "palace"]) {
      expect(screen.getByTestId(`flow-stage-${stage}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("flow-stage-constellations")).toHaveAttribute("data-reached", "true");
    expect(screen.getByTestId("flow-stage-timeline")).toHaveAttribute("data-reached", "false");
    expect(screen.getByTestId("flow-subject")).toHaveTextContent("Banda genocide");
  });

  it("offers Send to timeline at the frontier and calls the seam with the entered year", async () => {
    const actions = fakeActions();
    render(
      <FlowView
        node={node}
        stageState={stateAt({})}
        candidatePlaces={places}
        actions={actions}
        onJump={() => {}}
      />,
    );
    fireEvent.change(screen.getByTestId("flow-year-input"), {
      target: { value: "1621" },
    });
    await clickAndSettle("flow-send-to-timeline");
    expect(actions.sendToTimeline).toHaveBeenCalledWith(node, "1621");
  });

  it("offers Locate once the object is on the timeline and connects to the selected place", async () => {
    const actions = fakeActions();
    render(
      <FlowView
        node={node}
        stageState={stateAt({ timeline: true })}
        candidatePlaces={places}
        actions={actions}
        onJump={() => {}}
      />,
    );
    expect(screen.queryByTestId("flow-send-to-timeline")).not.toBeInTheDocument();
    await clickAndSettle("flow-locate");
    expect(actions.locate).toHaveBeenCalledWith(node, placeBanda);
  });

  it("offers Add to story once located, and Place in palace once storied", async () => {
    const actions = fakeActions();
    render(
      <FlowView
        node={node}
        stageState={stateAt({ timeline: true, places: true })}
        candidatePlaces={places}
        actions={actions}
        onJump={() => {}}
      />,
    );
    await clickAndSettle("flow-add-to-story");
    expect(actions.addToStory).toHaveBeenCalledWith(node);

    const actions2 = fakeActions();
    render(
      <FlowView
        node={node}
        stageState={stateAt({ timeline: true, places: true, stories: true })}
        candidatePlaces={places}
        actions={actions2}
        onJump={() => {}}
      />,
    );
    await clickAndSettle("flow-place-in-palace");
    expect(actions2.placeInPalace).toHaveBeenCalledWith(node);
  });

  it("shows jump buttons into each reached stage surface", () => {
    const onJump = vi.fn();
    render(
      <FlowView
        node={node}
        stageState={stateAt({ timeline: true, places: true, stories: true, palace: true })}
        candidatePlaces={places}
        actions={fakeActions()}
        onJump={onJump}
      />,
    );
    fireEvent.click(screen.getByTestId("flow-jump-timeline"));
    expect(onJump).toHaveBeenCalledWith("timeline");
    fireEvent.click(screen.getByTestId("flow-jump-places"));
    expect(onJump).toHaveBeenCalledWith("psychogeographic");
    fireEvent.click(screen.getByTestId("flow-jump-palace"));
    expect(onJump).toHaveBeenCalledWith("palace");
  });

  it("surfaces a transport error in the flow view", async () => {
    const actions = fakeActions();
    (actions.sendToTimeline as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("bridge refused"),
    );
    render(
      <FlowView
        node={node}
        stageState={stateAt({})}
        candidatePlaces={places}
        actions={actions}
        onJump={() => {}}
      />,
    );
    await clickAndSettle("flow-send-to-timeline");
    expect(await screen.findByTestId("flow-error")).toHaveTextContent("bridge refused");
  });
});
