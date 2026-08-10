import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, test, vi } from "vitest";
import type { TimelineWalk as TimelineWalkData } from "./walk";
import { TimelineWalk } from "./TimelineWalk";

function walk(over: Partial<TimelineWalkData>): TimelineWalkData {
  return {
    stops: [
      {
        graphNodeId: "council",
        title: "Council of Florence",
        validFrom: "1438-04-09",
        validTo: "1445-08-07",
        placeGraphNodeId: "florence",
        placeTitle: "Florence",
        located: true,
        frame: {
          frameNodeId: "council",
          title: "Council of Florence",
          spatialFrame: "none",
          window: { startYear: 1438, endYear: 1445 },
        },
        frameMembers: ["florence", "council"],
      },
      {
        graphNodeId: "balfour",
        title: "Balfour Declaration",
        validFrom: "1917-01-01",
        validTo: null,
        placeGraphNodeId: null,
        placeTitle: null,
        located: false,
        frame: null,
        frameMembers: [],
      },
    ],
    locatedCount: 1,
    subtimelineCount: 1,
    ...over,
  };
}

function renderWalk(overrides: Partial<ComponentProps<typeof TimelineWalk>> = {}) {
  return render(
    <TimelineWalk
      walk={walk()}
      onSelectStop={vi.fn()}
      resolveNodeTitle={(graphNodeId) =>
        graphNodeId === "florence" ? "Florence" : null
      }
      {...overrides}
    />,
  );
}

describe("TimelineWalk", () => {
  test("renders stops in order with date, title, and place chip; located flag is exposed", () => {
    renderWalk();
    expect(screen.getByTestId("timeline-walk")).toBeInTheDocument();
    expect(screen.getByTestId("timeline-walk-stops").children).toHaveLength(2);

    const council = screen.getByTestId("timeline-walk-stop-council");
    expect(council).toHaveAttribute("data-located", "true");
    expect(council).toHaveAttribute("data-walk-index", "0");
    expect(council).toHaveTextContent("Council of Florence");
    expect(council).toHaveTextContent("@ Florence");

    const balfour = screen.getByTestId("timeline-walk-stop-balfour");
    expect(balfour).toHaveAttribute("data-located", "false");
  });

  test("nested frame members resolve to titles; counts surface", () => {
    renderWalk();
    const frame = screen.getByTestId("timeline-walk-frame-council");
    expect(frame).toBeInTheDocument();
    expect(frame).toHaveTextContent("Florence");
    expect(screen.getByTestId("timeline-walk")).toHaveTextContent("2 stops");
    expect(screen.getByTestId("timeline-walk")).toHaveTextContent("1 located");
    expect(screen.getByTestId("timeline-walk")).toHaveTextContent("1 framed");
  });

  test("clicking a stop fires onSelectStop with its graph node id", () => {
    const onSelectStop = vi.fn();
    renderWalk({ onSelectStop });
    fireEvent.click(screen.getByText("Balfour Declaration"));
    expect(onSelectStop).toHaveBeenCalledWith("balfour");
  });

  test("renders an empty state when there are no dated events", () => {
    renderWalk({ walk: walk({ stops: [], locatedCount: 0, subtimelineCount: 0 }) });
    expect(screen.getByTestId("timeline-walk-empty")).toBeInTheDocument();
  });
});
