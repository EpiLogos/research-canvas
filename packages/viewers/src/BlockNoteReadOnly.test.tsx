import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BlockNoteReadOnly } from "./BlockNoteReadOnly";

describe("BlockNoteReadOnly", () => {
  it("renders a heading and paragraph from a BlockNote body", () => {
    const body = JSON.stringify([
      { type: "heading", props: { level: 1 }, content: [{ type: "text", text: "Title" }] },
      { type: "paragraph", content: [{ type: "text", text: "Body text" }] },
    ]);

    render(<BlockNoteReadOnly body={body} />);

    expect(screen.getByRole("heading", { name: "Title" })).toBeInTheDocument();
    expect(screen.getByText("Body text")).toBeInTheDocument();
  });

  it("renders nothing meaningful for an empty body without throwing", () => {
    const { container } = render(<BlockNoteReadOnly body="[]" />);
    expect(container.querySelector(".markdown-viewer")).not.toBeNull();
  });
});
