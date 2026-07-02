import { createStore, type StoreApi } from "zustand/vanilla";
import type { AgentActivity, WorkspaceTransport } from "@research-canvas/desktop-api";

export interface AgentActivityState {
  items: AgentActivity[];
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
  refresh(): Promise<void>;
  markReviewed(id: string): void;
  newCount(): number;
}

export function createAgentActivityStore(
  transport: Pick<WorkspaceTransport, "listAgentActivity">,
): StoreApi<AgentActivityState> {
  return createStore<AgentActivityState>((set, get) => ({
    items: [],
    status: "idle",
    error: null,
    async refresh() {
      set({ status: "loading", error: null });
      try {
        const items = await transport.listAgentActivity({ limit: 100 });
        set({ items, status: "ready" });
      } catch (cause) {
        set({
          status: "error",
          error: cause instanceof Error ? cause.message : String(cause),
        });
      }
    },
    markReviewed(id: string) {
      set({
        items: get().items.map((item) =>
          item.id === id ? { ...item, reviewed: true } : item,
        ),
      });
    },
    newCount() {
      return get().items.filter(
        (item) => item.kind === "node_created" && !item.reviewed,
      ).length;
    },
  }));
}
