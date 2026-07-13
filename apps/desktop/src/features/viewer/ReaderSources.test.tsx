import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReaderSources, collectReaderSources } from "./ReaderSources";

describe("ReaderSources", () => {
  it("preserves source provenance while deduplicating the same canonical file coordinate", () => {
    expect(collectReaderSources({
      sourceCoordinates: ["episodes/2/banda.md#event"],
      bodySourceCoordinates: ["episodes/2/banda.md#event", "research/ship-log.md#folio-17"],
      qlSourceCoordinates: ["ql/banda-unit.md#P3"],
    })).toEqual([
      {
        coordinate: "episodes/2/banda.md#event",
        provenance: ["Node metadata", "Long-form document"],
      },
      {
        coordinate: "research/ship-log.md#folio-17",
        provenance: ["Long-form document"],
      },
      {
        coordinate: "ql/banda-unit.md#P3",
        provenance: ["QL framing"],
      },
    ]);
  });

  it("renders safe workspace coordinates as file links and keeps non-file coordinates honest", () => {
    render(
      <ReaderSources
        workspaceRoot="/workspace/antichrist-vault"
        sources={[
          { coordinate: "episodes/2/banda.md#event", provenance: ["Node metadata"] },
          { coordinate: "antichrist-vault/episodes/1/ql-units/unit-ontological.md", provenance: ["QL framing"] },
          { coordinate: "#P3", provenance: ["QL framing"] },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: /episodes\/2\/banda\.md#event/ })).toHaveAttribute(
      "href",
      "asset://localhost/%2Fworkspace%2Fantichrist-vault%2Fepisodes%2F2%2Fbanda.md#event",
    );
    expect(screen.getByText("#P3")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "#P3" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "antichrist-vault/episodes/1/ql-units/unit-ontological.md" })).toHaveAttribute(
      "href",
      "asset://localhost/%2Fworkspace%2Fantichrist-vault%2Fepisodes%2F1%2Fql-units%2Funit-ontological.md",
    );
    expect(screen.getByText("Node metadata")).toBeInTheDocument();
  });
});
