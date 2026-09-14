import {
  type AppTab,
  type SurfaceId,
  type SurfaceTabState,
} from "@research-canvas/schema";
import { createStore } from "zustand/vanilla";

export interface CreateTabManagerStoreOptions {
  /** Optional side-effect invoked after any tab mutation. */
  onPersist?: (state: TabManagerStateSnapshot) => void;
}

export interface TabManagerStateSnapshot {
  tabs: AppTab[];
  activeTabId: string | null;
}

export interface TabManagerState extends TabManagerStateSnapshot {
  /** Open a tab. If a tab with the same id already exists it is replaced. */
  open: (tab: AppTab, options?: { activate?: boolean }) => void;
  /** Make an existing tab the active tab. */
  activate: (tabId: string) => void;
  /** Close a tab and activate another if the closed tab was active. */
  close: (tabId: string) => void;
  /** Close every tab except the given one (defaults to the active tab). */
  closeOthers: (tabId?: string) => void;
  /** Close all tabs. */
  closeAll: () => void;
  /** Update mutable tab metadata. */
  update: (tabId: string, patch: Partial<Pick<AppTab, "title" | "pinned">>) => void;
  /** Replace the persisted view state of a tab, preserving its surface identity. */
  updateState: (tabId: string, state: SurfaceTabState) => void;
  /** True if a tab with the given id is open. */
  has: (tabId: string) => boolean;
  /** Return the active tab, or null if there are no tabs. */
  getActiveTab: () => AppTab | null;
  /** Hydrate the whole manager (used when restoring persisted tabs). */
  hydrate: (snapshot: TabManagerStateSnapshot) => void;
}

function defaultSurfaceState(surfaceId: SurfaceId): SurfaceTabState {
  switch (surfaceId) {
    case "projects":
      return { surfaceId: "projects" };
    case "canvas":
      return { surfaceId: "canvas", canvasId: "", constellationId: "", viewport: { x: 0, y: 0, zoom: 1 } };
    case "timeline":
      return { surfaceId: "timeline", centerYear: 0, pixelsPerYear: 20 };
    case "places":
      return { surfaceId: "places", viewport: { x: 0, y: 0, zoom: 1 } };
    case "story":
      return { surfaceId: "story" };
    case "palace":
      return { surfaceId: "palace" };
    default:
      return { surfaceId: "projects" };
  }
}

function nextActiveId(
  tabs: AppTab[],
  closedId: string,
  currentActiveId: string | null,
): string | null {
  if (currentActiveId !== closedId) {
    return currentActiveId;
  }

  const closedIndex = tabs.findIndex((tab) => tab.id === closedId);
  if (closedIndex === -1) return currentActiveId;

  const candidate = tabs[closedIndex - 1] ?? tabs[closedIndex + 1] ?? null;
  return candidate?.id ?? null;
}

export function createTabManagerStore(
  initial: TabManagerStateSnapshot = { tabs: [], activeTabId: null },
  options: CreateTabManagerStoreOptions = {},
) {
  const { onPersist } = options;

  const notify = (state: TabManagerStateSnapshot) => {
    onPersist?.(state);
  };

  return createStore<TabManagerState>((set, get) => ({
    tabs: initial.tabs,
    activeTabId: initial.activeTabId,

    open: (tab, { activate = true } = {}) => {
      set((state) => {
        const existingIndex = state.tabs.findIndex((t) => t.id === tab.id);
        const tabs =
          existingIndex === -1
            ? [...state.tabs, tab]
            : state.tabs.map((t, i) => (i === existingIndex ? tab : t));
        const activeTabId = activate ? tab.id : state.activeTabId;
        return { tabs, activeTabId };
      });
      const after = get();
      notify(after);
    },

    activate: (tabId) => {
      set((state) => {
        if (!state.tabs.some((t) => t.id === tabId)) return state;
        return { activeTabId: tabId };
      });
      const after = get();
      notify(after);
    },

    close: (tabId) => {
      set((state) => {
        const tabs = state.tabs.filter((t) => t.id !== tabId);
        const activeTabId = nextActiveId(state.tabs, tabId, state.activeTabId);
        return { tabs, activeTabId };
      });
      const after = get();
      notify(after);
    },

    closeOthers: (tabId) => {
      set((state) => {
        const keepId = tabId ?? state.activeTabId;
        if (keepId === null) return state;
        const kept = state.tabs.find((t) => t.id === keepId);
        if (!kept) return state;
        return { tabs: [kept], activeTabId: kept.id };
      });
      const after = get();
      notify(after);
    },

    closeAll: () => {
      set({ tabs: [], activeTabId: null });
      const after = get();
      notify(after);
    },

    update: (tabId, patch) => {
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === tabId ? { ...t, ...patch } : t,
        ),
      }));
      const after = get();
      notify(after);
    },

    updateState: (tabId, nextState) => {
      set((state) => ({
        tabs: state.tabs.map((t) =>
          t.id === tabId ? { ...t, state: nextState } : t,
        ),
      }));
      const after = get();
      notify(after);
    },

    has: (tabId) => get().tabs.some((t) => t.id === tabId),

    getActiveTab: () =>
      get().tabs.find((t) => t.id === get().activeTabId) ?? null,

    hydrate: (snapshot) => {
      const tabs = snapshot.tabs.map((tab) => ({
        ...tab,
        state: { ...defaultSurfaceState(tab.surfaceId), ...tab.state },
      }));
      set({ tabs, activeTabId: snapshot.activeTabId });
      const after = get();
      notify(after);
    },
  }));
}

export type TabManagerStore = ReturnType<typeof createTabManagerStore>;
