import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import type { AgentActivity, NodeLayout } from "@research-canvas/desktop-api";
import { AgentActivityPanel } from "./AgentActivityPanel";

function activity(over: Partial<AgentActivity>): AgentActivity {
  return {
    id: "a1",
    canvasId: "c1",
    kind: "node_created",
    graphNodeId: "gn-1",
    relationshipId: null,
    title: "Cosimo de Medici",
    entityType: "Figure",
    detailJson: "{}",
    reviewed: false,
    placed: false,
    createdAt: "2026-06-28T00:00:00Z",
    ...over,
  };
}

function makeTransport(
  items: AgentActivity[],
  onPlace: (input: { databasePath?: string; layout: NodeLayout }) => void,
) {
  return {
    listAgentActivity: vi.fn(async () => items),
    upsertNodeLayout: vi.fn(
      async (input: { databasePath?: string; layout: NodeLayout }) => {
        onPlace(input);
      },
    ),
  } as never;
}

describe("AgentActivityPanel", () => {
  it("lists activity titles", async () => {
    const transport = makeTransport([activity({ title: "Cosimo de Medici" })], () => {});
    render(
      <AgentActivityPanel transport={transport} canvasId="c1" databasePath="/tmp/db.sqlite" />,
    );
    await waitFor(() =>
      expect(screen.getByText("Cosimo de Medici")).toBeInTheDocument(),
    );
  });

  it("places a new node (with databasePath) and removes the Review & place button", async () => {
    const placed: Array<{ databasePath?: string; layout: NodeLayout }> = [];
    const transport = makeTransport(
      [activity({ id: "a1", graphNodeId: "gn-1", reviewed: false })],
      (input) => placed.push(input),
    );
    render(
      <AgentActivityPanel transport={transport} canvasId="c1" databasePath="/tmp/db.sqlite" />,
    );
    const button = await screen.findByRole("button", { name: /review & place/i });
    fireEvent.click(button);
    await waitFor(() => expect(placed).toHaveLength(1));
    expect(placed[0].databasePath).toBe("/tmp/db.sqlite");
    expect(placed[0].layout.graphNodeId).toBe("gn-1");
    expect(placed[0].layout.canvasId).toBe("c1");
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /review & place/i }),
      ).not.toBeInTheDocument(),
    );
  });
});
