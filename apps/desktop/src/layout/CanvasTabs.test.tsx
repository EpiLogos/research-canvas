import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CanvasTabs } from "./CanvasTabs";

describe("CanvasTabs", () => {
  it("renders persistent constellation tabs, activates a target once, and protects the root tab", () => {
    const onActivate = vi.fn();
    const onClose = vi.fn();
    render(
      <CanvasTabs
        tabs={[
          { id: "root:canvas-root", label: "Archetypal field", pinned: true },
          { id: "episode-2:canvas-episode-2", label: "Episode 2", pinned: false },
        ]}
        activeTabId="episode-2:canvas-episode-2"
        onActivate={onActivate}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole("tab", { name: "Archetypal field" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "Episode 2" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("button", { name: "Close Archetypal field" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Archetypal field" }));
    fireEvent.click(screen.getByRole("button", { name: "Close Episode 2" }));
    expect(onActivate).toHaveBeenCalledWith("root:canvas-root");
    expect(onClose).toHaveBeenCalledWith("episode-2:canvas-episode-2");
  });
});
