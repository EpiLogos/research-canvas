import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarkdownViewer } from "./MarkdownViewer";

describe("MarkdownViewer", () => {
  it("renders headings, emphasis, lists, and links from markdown content", () => {
    render(
      <MarkdownViewer
        content={`# Opening note

This has **bold text** and a [source link](https://example.com).

- first point
- second point`}
      />
    );

    expect(
      screen.getByRole("heading", { name: "Opening note" }),
    ).toBeInTheDocument();
    expect(screen.getByText("bold text")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "source link" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getByText("first point")).toBeInTheDocument();
  });
});
