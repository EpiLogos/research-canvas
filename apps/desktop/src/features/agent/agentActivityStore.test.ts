import { describe, expect, it } from "vitest";
import type { AgentActivity } from "@research-canvas/desktop-api";
import { createAgentActivityStore } from "./agentActivityStore";

function activity(over: Partial<AgentActivity>): AgentActivity {
  return {
    id: "a1",
    canvasId: "c1",
    kind: "node_created",
    graphNodeId: "gn-1",
    relationshipId: null,
    title: "Node",
    entityType: "Figure",
    detailJson: "{}",
    reviewed: false,
    placed: false,
    createdAt: "2026-06-28T00:00:00Z",
    ...over,
  };
}

describe("agentActivityStore", () => {
  it("loads items and reports ready", async () => {
    const items = [activity({ id: "a1" }), activity({ id: "a2" })];
    const store = createAgentActivityStore({
      listAgentActivity: async () => items,
    });
    await store.getState().refresh();
    expect(store.getState().status).toBe("ready");
    expect(store.getState().items).toHaveLength(2);
  });

  it("counts unreviewed node_created items", async () => {
    const store = createAgentActivityStore({
      listAgentActivity: async () => [
        activity({ id: "a1", kind: "node_created", reviewed: false }),
        activity({ id: "a2", kind: "node_created", reviewed: true }),
        activity({ id: "a3", kind: "relationship_created", reviewed: false }),
      ],
    });
    await store.getState().refresh();
    expect(store.getState().newCount()).toBe(1);
  });

  it("markReviewed flips an item optimistically", async () => {
    const store = createAgentActivityStore({
      listAgentActivity: async () => [activity({ id: "a1", reviewed: false })],
    });
    await store.getState().refresh();
    store.getState().markReviewed("a1");
    expect(store.getState().items[0].reviewed).toBe(true);
    expect(store.getState().newCount()).toBe(0);
  });

  it("sets error status when the transport throws", async () => {
    const store = createAgentActivityStore({
      listAgentActivity: async () => {
        throw new Error("backend down");
      },
    });
    await store.getState().refresh();
    expect(store.getState().status).toBe("error");
    expect(store.getState().error).toBe("backend down");
  });
});
