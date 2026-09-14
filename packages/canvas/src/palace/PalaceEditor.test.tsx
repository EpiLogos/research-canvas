import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useState } from "react";

import type { PalaceLayout } from "@research-canvas/domain";

import { PalaceEditor } from "./PalaceEditor";

const initialLayout: PalaceLayout = {
  constellationId: "constellation:one",
  rooms: [
    {
      id: "room:a",
      graphNodeId: "node:a",
      title: "A",
      position: { x: 0, y: 0, z: 0 },
      size: { width: 6, height: 4, depth: 6 },
      form: "cube",
    },
    {
      id: "room:b",
      graphNodeId: "node:b",
      title: "B",
      position: { x: 8, y: 0, z: 0 },
      size: { width: 6, height: 4, depth: 6 },
      form: "cube",
    },
  ],
  corridors: [],
  objects: [],
};

function Harness({ onPersist = vi.fn() }: { onPersist?: (layout: PalaceLayout) => void }) {
  const [layout, setLayout] = useState(initialLayout);
  return (
    <PalaceEditor
      layout={layout}
      nodes={[]}
      onGenerate={() => undefined}
      onChange={(next) => {
        setLayout(next);
        onPersist(next);
      }}
    >
      <div data-testid="mature-palace">3D Palace</div>
    </PalaceEditor>
  );
}

describe("PalaceEditor", () => {
  test("adds and removes presentation rooms without replacing the mature palace surface", () => {
    const persist = vi.fn();
    render(<Harness onPersist={persist} />);

    expect(screen.getByTestId("mature-palace")).toBeInTheDocument();
    expect(screen.getAllByTestId(/^palace-room-/)).toHaveLength(2);
    fireEvent.click(screen.getByTestId("palace-add-room"));
    expect(screen.getAllByTestId(/^palace-room-/)).toHaveLength(3);
    expect(persist).toHaveBeenCalled();

    const manual = screen.getAllByTestId(/^palace-room-/).at(-1)!;
    const deleteButton = manual.querySelector("button");
    expect(deleteButton).not.toBeNull();
    fireEvent.click(deleteButton!);
    expect(screen.getAllByTestId(/^palace-room-/)).toHaveLength(2);
  });

  test("adds a corridor between the latest rooms", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("palace-add-corridor"));
    expect(screen.getAllByTestId(/^palace-corridor-/)).toHaveLength(1);
  });

  test("wall placement exposes a face ghost and persists the confirmed object", () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId("palace-place-object"));
    expect(screen.getByTestId("palace-place-ghost")).toHaveTextContent("north face");
    fireEvent.click(screen.getByTestId("palace-wall-face-east"));
    expect(screen.getByTestId("palace-place-ghost")).toHaveTextContent("east face");
    fireEvent.click(screen.getByTestId("palace-place-confirm"));
    expect(screen.getAllByTestId(/^palace-wall-object-/)).toHaveLength(1);
  });
});
