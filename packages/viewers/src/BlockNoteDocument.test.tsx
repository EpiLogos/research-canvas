import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";

import { BlockNoteDocument } from "./BlockNoteDocument";

beforeAll(() => {
  // BlockNote/Mantine read matchMedia and ResizeObserver at mount; jsdom lacks both.
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
  }
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

describe("BlockNoteDocument", () => {
  it("mounts the editor and renders seeded paragraph text", async () => {
    const body = JSON.stringify([
      {
        id: "b1",
        type: "paragraph",
        props: {},
        content: [{ type: "text", text: "Seeded text", styles: {} }],
        children: [],
      },
    ]);

    render(<BlockNoteDocument body={body} editable={false} />);

    expect(await screen.findByText("Seeded text")).toBeInTheDocument();
  });

  it("mounts without throwing for an empty body", () => {
    const { container } = render(<BlockNoteDocument body="[]" editable={false} />);
    expect(container.querySelector(".blocknote-document")).not.toBeNull();
  });

  it("shows a visible save-failed indicator when saveState is 'error'", () => {
    render(
      <BlockNoteDocument
        body="[]"
        editable
        saveState="error"
        saveErrorMessage="neo4j unreachable"
      />
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("blocknote-document__save-error");
    expect(alert).toHaveTextContent(/save failed/i);
    expect(alert).toHaveTextContent("neo4j unreachable");
  });

  it("does not show the save-failed indicator when not in error", () => {
    render(<BlockNoteDocument body="[]" editable saveState="saving" />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
