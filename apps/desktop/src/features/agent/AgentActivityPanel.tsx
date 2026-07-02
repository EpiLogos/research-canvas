import { useEffect, useMemo } from "react";
import { useStore } from "zustand";
import type { NodeLayout, WorkspaceTransport } from "@research-canvas/desktop-api";
import { createAgentActivityStore } from "./agentActivityStore";

export const PLACE_OFFSET = 80;

interface AgentActivityPanelProps {
  transport: WorkspaceTransport;
  canvasId: string;
  /** Active workspace SQLite path; passed through to upsertNodeLayout so the
   *  Rust command doesn't need to fall back to SharedApiState.db_path. Null
   *  until the workspace is hydrated — Review & place is disabled while null. */
  databasePath: string | null;
}

const KIND_LABEL: Record<string, string> = {
  node_created: "New node",
  node_updated: "Node updated",
  relationship_created: "New relationship",
  episode_ingested: "Episode ingested",
};

export function AgentActivityPanel({
  transport,
  canvasId,
  databasePath,
}: AgentActivityPanelProps) {
  const store = useMemo(() => createAgentActivityStore(transport), [transport]);
  const items = useStore(store, (s) => s.items);
  const status = useStore(store, (s) => s.status);
  const error = useStore(store, (s) => s.error);
  const newCount = useStore(store, (s) => s.newCount());

  useEffect(() => {
    void store.getState().refresh();
  }, [store]);

  async function reviewAndPlace(graphNodeId: string | null, id: string, index: number) {
    if (!graphNodeId || !databasePath) return;
    const layout: NodeLayout = {
      graphNodeId,
      canvasId,
      positionX: index * PLACE_OFFSET,
      positionY: index * PLACE_OFFSET,
      width: 240,
      height: 140,
      style: {},
    };
    // WS2's upsert_node_layout_command falls back to SharedApiState.db_path
    // when omitted, but we thread databasePath through explicitly when known.
    await transport.upsertNodeLayout({ databasePath, layout });
    store.getState().markReviewed(id);
  }

  return (
    <section className="agent-activity-panel" data-testid="agent-activity-panel">
      <header className="agent-activity-panel__header">
        <h2>Agent Activity</h2>
        {newCount > 0 && (
          <span className="agent-activity-panel__badge" data-testid="agent-new-count">
            {newCount} new
          </span>
        )}
      </header>

      {status === "error" && (
        <p className="agent-activity-panel__error">{error}</p>
      )}
      {status === "ready" && items.length === 0 && (
        <p className="agent-activity-panel__empty">
          No agent activity yet. Run the agent in the terminal to author nodes.
        </p>
      )}

      <ul className="agent-activity-panel__list">
        {items.map((item, index) => (
          <li
            key={item.id}
            className="agent-activity-item"
            data-reviewed={item.reviewed ? "true" : "false"}
          >
            <span className="agent-activity-item__kind">
              {KIND_LABEL[item.kind] ?? item.kind}
            </span>
            <span className="agent-activity-item__title">{item.title || "(untitled)"}</span>
            {item.entityType && (
              <span className="agent-activity-item__type">{item.entityType}</span>
            )}
            {item.kind === "node_created" && !item.reviewed && item.graphNodeId && (
              <button
                type="button"
                className="agent-activity-item__place"
                disabled={!databasePath}
                title={databasePath ? undefined : "Open a workspace to place nodes"}
                onClick={() => void reviewAndPlace(item.graphNodeId, item.id, index)}
              >
                Review &amp; place
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
