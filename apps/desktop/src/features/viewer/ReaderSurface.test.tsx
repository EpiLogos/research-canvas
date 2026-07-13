import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ReaderRecord } from "./readerRecord";
import { ReaderSurface } from "./ReaderSurface";

const record = {
  kind: "graph",
  graphNodeId: "banda-1621",
  canvasNode: null,
  graphNode: null,
  title: "The Banda genocide",
  pith: "A documented Company-state violence event.",
  coverReference: "assets/banda/ship.png",
  evidenceTags: ["history:documented", "place:banda-islands"],
  sourceCoordinates: ["episodes/2/colonial-power.md#banda"],
  bodySourceCoordinates: ["research/banda-archive.md#company-fleet"],
  narrative: {
    historicity: "historical",
    claimKind: "fact",
    evidenceStatus: "documented",
    temporalRole: "occurred_at",
    sourceKind: "research",
  },
  ql: {
    form: "quaternity",
    unitId: "ql-banda",
    arc: "day",
    topology: "torus",
    schemaVersion: 2,
    sourceCoordinates: ["ql/banda-unit.md#P3"],
    completeness: "complete",
  },
  placeTags: ["place:banda-islands"],
  temporal: { validFrom: "1621-01-01", validTo: null, precision: "year" },
  placeCoverage: "resolved",
} satisfies ReaderRecord;

describe("ReaderSurface", () => {
  it.each([
    ["canvas", { ...record, canvasNode: { id: "canvas-banda" } }],
    ["timeline", record],
  ] as const)("gives the %s origin the same rich reader framing", (_origin, readerRecord) => {
    const onClose = vi.fn();
    const { unmount } = render(
      <ReaderSurface
        record={readerRecord as ReaderRecord}
        workspaceRoot="/workspace/project"
        variant="overlay"
        onExit={onClose}
        actions={<button type="button">Add relation</button>}
      >
        <article>Deep historical reading</article>
      </ReaderSurface>,
    );

    expect(screen.getByRole("heading", { name: "The Banda genocide" })).toBeInTheDocument();
    expect(screen.getByText("A documented Company-state violence event.")).toBeInTheDocument();
    expect(screen.getByTestId("reader-cover")).toHaveAttribute(
      "src",
      "asset://localhost/%2Fworkspace%2Fproject%2Fassets%2Fbanda%2Fship.png",
    );
    expect(screen.getByText("Deep historical reading")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show reader details" }));
    expect(screen.getByRole("link", { name: "episodes/2/colonial-power.md#banda" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "research/banda-archive.md#company-fleet" })).toBeInTheDocument();
    expect(screen.getByText("QL unit · ql-banda")).toBeInTheDocument();
    expect(screen.getByText("historical · fact · documented")).toBeInTheDocument();
    expect(screen.getByText("banda islands")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add relation" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close reading" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("closes an overlay from its scrim or Escape without relying on a raw text control", () => {
    const onClose = vi.fn();
    render(
      <ReaderSurface
        record={record}
        workspaceRoot="/workspace/project"
        variant="overlay"
        onExit={onClose}
      >
        <article>Deep historical reading</article>
      </ReaderSurface>,
    );

    fireEvent.click(screen.getByTestId("reader-scrim"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
