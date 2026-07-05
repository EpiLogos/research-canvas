import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TimelineTransport } from "./TimelineTransport";

function props(overrides = {}) {
  return { playing: false, onTogglePlay: vi.fn(), fraction: 0.25, onScrub: vi.fn(), label: "1789", onPlaySequence: vi.fn(), ...overrides };
}

describe("TimelineTransport", () => {
  it("shows Play when paused and toggles", () => {
    const p = props();
    render(<TimelineTransport {...p} />);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(p.onTogglePlay).toHaveBeenCalledTimes(1);
  });

  it("shows Pause when playing", () => {
    render(<TimelineTransport {...props({ playing: true })} />);
    expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("reports scrub changes as a 0..1 fraction", () => {
    const p = props();
    render(<TimelineTransport {...p} />);
    fireEvent.change(screen.getByTestId("timeline-scrub"), { target: { value: "0.5" } });
    expect(p.onScrub).toHaveBeenCalledWith(0.5);
  });

  it("shows the instant label and a play-sequence button", () => {
    const p = props();
    render(<TimelineTransport {...p} />);
    expect(screen.getByText("1789")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Play sequence" }));
    expect(p.onPlaySequence).toHaveBeenCalledTimes(1);
  });
});
