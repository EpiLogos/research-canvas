import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusStrip } from "./StatusStrip";

describe("StatusStrip", () => {
  it("shows counts and synced state", () => {
    render(<StatusStrip synced nodeCount={214} relationCount={340} lens="canvas" />);
    expect(screen.getByTestId("status-strip")).toBeVisible();
    expect(screen.getByText(/214 nodes/)).toBeInTheDocument();
    expect(screen.getByText(/340 relations/)).toBeInTheDocument();
    expect(screen.getByText(/synced/i)).toBeInTheDocument();
  });

  it("labels the register by lens", () => {
    const { rerender } = render(
      <StatusStrip synced nodeCount={0} relationCount={0} lens="canvas" />,
    );
    expect(screen.getByText(/trans-temporal/)).toBeInTheDocument();
    rerender(<StatusStrip synced nodeCount={0} relationCount={0} lens="timeline" />);
    expect(screen.getByText(/datable/)).toBeInTheDocument();
  });
});
