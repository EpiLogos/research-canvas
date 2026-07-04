import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { IconStrip } from "./IconStrip";

function setup(overrides: Partial<Parameters<typeof IconStrip>[0]> = {}) {
  const props = {
    leftOpen: false,
    activeLeftMode: "files" as const,
    onToggleLeft: vi.fn(),
    onSetLeftMode: vi.fn(),
    onOpenSequences: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenInspector: vi.fn(),
    onOpenTerminal: vi.fn(),
    ...overrides,
  };
  render(<IconStrip {...props} />);
  return props;
}

describe("IconStrip rail", () => {
  it("exposes Inspector and Terminal verbs", () => {
    setup();
    expect(screen.getByRole("button", { name: "Inspector" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Terminal" })).toBeInTheDocument();
  });

  it("summons the terminal", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: "Terminal" }));
    expect(props.onOpenTerminal).toHaveBeenCalledTimes(1);
  });

  it("summons the inspector", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: "Inspector" }));
    expect(props.onOpenInspector).toHaveBeenCalledTimes(1);
  });
});
