import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { IconStrip } from "./IconStrip";

function setup(overrides: Partial<Parameters<typeof IconStrip>[0]> = {}) {
  const props = {
    browserActive: false,
    activeLeftMode: "files" as const,
    onToggleBrowser: vi.fn(),
    onSetBrowserMode: vi.fn(),
    onPreviewBrowserMode: vi.fn(),
    onBrowserInteractionStart: vi.fn(),
    onBrowserInteractionEnd: vi.fn(),
    onOpenSequences: vi.fn(),
    onOpenSettings: vi.fn(),
    inspectorActive: false,
    onToggleInspector: vi.fn(),
    terminalActive: false,
    onToggleTerminal: vi.fn(),
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
    expect(props.onToggleTerminal).toHaveBeenCalledTimes(1);
  });

  it("summons the inspector", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: "Inspector" }));
    expect(props.onToggleInspector).toHaveBeenCalledTimes(1);
  });

  it("Files verb sets the files leftMode when the browser is closed (uniform with Search/Annotate)", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: "Files & Constellation" }));
    expect(props.onSetBrowserMode).toHaveBeenCalledWith("files");
    expect(props.onToggleBrowser).not.toHaveBeenCalled();
  });

  it("Files verb toggles the browser closed when Files is already the active mode (re-click closes)", () => {
    const props = setup({ browserActive: true, activeLeftMode: "files" });
    fireEvent.click(screen.getByRole("button", { name: "Files & Constellation" }));
    expect(props.onToggleBrowser).toHaveBeenCalledTimes(1);
    expect(props.onSetBrowserMode).not.toHaveBeenCalled();
  });

  it("Files verb restores the Files view when another mode (e.g. Annotations) is active", () => {
    const props = setup({ browserActive: true, activeLeftMode: "annotations" });
    fireEvent.click(screen.getByRole("button", { name: "Files & Constellation" }));
    expect(props.onSetBrowserMode).toHaveBeenCalledWith("files");
    expect(props.onToggleBrowser).not.toHaveBeenCalled();
  });

  it("previews a browser tool on hover and keeps the drawer interaction alive", () => {
    const props = setup();
    const files = screen.getByRole("button", { name: "Files & Constellation" });
    fireEvent.pointerEnter(files);
    expect(props.onPreviewBrowserMode).toHaveBeenCalledWith("files");
    expect(props.onBrowserInteractionStart).toHaveBeenCalled();

    fireEvent.pointerLeave(screen.getByTestId("left-rail"));
    expect(props.onBrowserInteractionEnd).toHaveBeenCalled();
  });
});
