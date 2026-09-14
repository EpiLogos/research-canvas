import type { AppTab } from "@research-canvas/schema";
import type {
  ConstellationTreeNode,
  WorkspaceBootstrap,
  WorkspaceServices,
} from "@research-canvas/desktop-api";

export interface WorkspaceTabSnapshot {
  tabs: AppTab[];
  activeTabId: string | null;
}

export function tabConstellationId(tab: AppTab | null | undefined): string | null {
  return tab && "constellationId" in tab.state ? tab.state.constellationId ?? null : null;
}

/** Bind only previously unbound surface state. Switching focus cannot transfer
 * an existing tab (and its authored state) into a different constellation. */
export function bindSurfaceTab(tab: AppTab, constellationId: string | null): AppTab {
  if (tab.state.surfaceId === "projects" || tabConstellationId(tab) || !constellationId) return tab;
  return { ...tab, state: { ...tab.state, constellationId } };
}

function containsConstellation(nodes: ConstellationTreeNode[], id: string): boolean {
  return nodes.some((node) => node.id === id || containsConstellation(node.children, id));
}

function canvasTabForConstellation(
  snapshot: WorkspaceTabSnapshot,
  constellationId: string,
): AppTab | null {
  return snapshot.tabs.find((tab) =>
    tab.surfaceId === "canvas" && tabConstellationId(tab) === constellationId,
  ) ?? null;
}

/** Resolve the active tab's owner through the canonical project-selection port
 * before publishing bootstrap state. Never infer ownership from a tab title or
 * independently manufacture a profile scope. An invalid persisted owner is an
 * explicit restoration failure, not permission to generate Palace under Root.
 *
 * Canvas is the one deliberate exception to tab-owner precedence: its owner is
 * a second representation of the selected project. Project selection is saved
 * by the native project boundary before React can finish hydrating/activating a
 * new Canvas tab, so a crash or fast reload may leave an older Canvas active in
 * the tab snapshot. When those two durable records disagree, the native active
 * project wins and we reactivate its Canvas (or leave activation empty so the
 * provider creates the primary Canvas). Scoped non-Canvas surfaces still own
 * their project identity and restore that owner through `selectProject`.
 *
 * Legacy unbound tabs retain their former current-workspace semantics until
 * first activation; only the active one can be bound unambiguously here. */
export async function restoreTabWorkspace(
  transport: Pick<WorkspaceServices, "selectProject">,
  workspace: WorkspaceBootstrap,
  snapshot: WorkspaceTabSnapshot,
): Promise<{ workspace: WorkspaceBootstrap; snapshot: WorkspaceTabSnapshot }> {
  const active = snapshot.tabs.find((tab) => tab.id === snapshot.activeTabId);
  const owner = tabConstellationId(active);
  let restored = workspace;
  let activeTabId = snapshot.activeTabId;

  if (
    active?.surfaceId === "canvas"
    && owner
    && owner !== workspace.activeConstellationId
  ) {
    activeTabId = canvasTabForConstellation(snapshot, workspace.activeConstellationId)?.id ?? null;
  } else if (owner && owner !== workspace.activeConstellationId) {
    if (!containsConstellation(workspace.constellations, owner)) {
      throw new Error(`Cannot restore tab ${active!.id}: constellation ${owner} is not in this workspace`);
    }
    const selected = await transport.selectProject({ databasePath: workspace.databasePath, projectId: owner });
    if (selected.projectId !== owner) {
      throw new Error(`Project selection returned ${selected.projectId} instead of tab owner ${owner}`);
    }
    restored = {
      ...workspace,
      activeConstellationId: selected.projectId,
      activeProjectId: selected.projectId,
      activeProfileScope: selected.profileScope,
    };
  }

  return {
    workspace: restored,
    snapshot: {
      ...snapshot,
      activeTabId,
      tabs: snapshot.tabs.map((tab) => tab.id === activeTabId
        ? bindSurfaceTab(tab, restored.activeConstellationId)
        : tab),
    },
  };
}

/** Every operation runs even if its predecessor rejected. Serial order is
 * important for durable selection and tab snapshots: completion order must not
 * let an older HTTP request overwrite a newer user action. */
export function createSerialWorkspaceQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation, operation);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}
