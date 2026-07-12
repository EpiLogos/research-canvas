import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { KnowledgeCard } from "./KnowledgeCard";

describe("KnowledgeCard", () => {
  test("leads with a named title, pith, semantic chips, and one visual surface", () => {
    render(
      <KnowledgeCard
        presentation={{
          title: "Banda Genocide",
          pith: "A documented 1621 massacre through which the VOC imposed monopoly power.",
          tags: ["documented", "colonialism"],
          badges: ["Historical", "1621"],
          coverUrl: undefined,
          palette: {
            id: "historical-event",
            label: "Historical event",
            accent: "#79c0d4",
            surface: "#102633",
            text: "#e6f6fb",
          },
        }}
      />,
    );

    const card = screen.getByTestId("knowledge-card");
    expect(card).toHaveStyle({ backgroundColor: "#102633", borderColor: "#79c0d4" });
    expect(screen.getByRole("heading", { name: "Banda Genocide" })).toBeInTheDocument();
    expect(screen.getByText(/VOC imposed monopoly power/)).toBeInTheDocument();
    expect(screen.getByText("documented")).toBeInTheDocument();
    expect(screen.getByText("Historical")).toBeInTheDocument();
    expect(document.querySelectorAll(".knowledge-card")).toHaveLength(1);
  });
});
