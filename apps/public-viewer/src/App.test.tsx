import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createSampleExportBundle } from "../../../tests/fixtures/export-fixture";
import { App } from "./App";

describe("public viewer app", () => {
  it("renders the desktop map, node links, and downloadable assets", () => {
    render(<App bundle={createSampleExportBundle()} />);

    expect(
      screen.getByRole("heading", { name: "Sample Project" })
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Opening note", level: 2 })
    ).toBeVisible();
    expect(screen.getByRole("link", { name: /download README.md/i })).toHaveAttribute(
      "href",
      "assets/README.md"
    );
  });

  it("switches to the sequence-first fallback on a narrow viewport", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 360,
      writable: true
    });
    window.dispatchEvent(new Event("resize"));

    render(<App bundle={createSampleExportBundle()} />);

    expect(
      screen.getByRole("heading", { name: /sequence-first exploration/i })
    ).toBeVisible();
  });
});
