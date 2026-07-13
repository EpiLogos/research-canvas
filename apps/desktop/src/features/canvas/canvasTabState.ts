import type { Viewport } from "@research-canvas/schema";

export interface CanvasTab {
  id: string;
  constellationId: string;
  canvasId: string;
  label: string;
  pinned: boolean;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  viewport: Viewport | null;
}

export interface CanvasTabState {
  tabs: CanvasTab[];
  activeTabId: string | null;
}

export interface CanvasTabInput {
  constellationId: string;
  canvasId: string;
  label: string;
  pinned: boolean;
  viewport?: Viewport | null;
}

export interface CanvasTabSession {
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  viewport: Viewport | null;
}

export function canvasTabId(constellationId: string, canvasId: string) {
  return `${constellationId}:${canvasId}`;
}

/** Opens a unique tab for a constellation/canvas pair, or simply focuses it. */
export function openOrActivateCanvasTab(
  state: CanvasTabState,
  input: CanvasTabInput,
): CanvasTabState {
  const id = canvasTabId(input.constellationId, input.canvasId);
  const existing = state.tabs.find((tab) => tab.id === id);
  if (existing) {
    const tabs = state.tabs.map((tab) => tab.id === id
      ? { ...tab, label: input.label, pinned: tab.pinned || input.pinned }
      : tab,
    );
    return { tabs, activeTabId: id };
  }

  return {
    tabs: [
      ...state.tabs,
      {
        id,
        constellationId: input.constellationId,
        canvasId: input.canvasId,
        label: input.label,
        pinned: input.pinned,
        selectedNodeId: null,
        selectedEdgeId: null,
        viewport: input.viewport ?? null,
      },
    ],
    activeTabId: id,
  };
}

export function activateCanvasTab(state: CanvasTabState, tabId: string): CanvasTabState {
  if (!state.tabs.some((tab) => tab.id === tabId) || state.activeTabId === tabId) return state;
  return { ...state, activeTabId: tabId };
}

/** Pinned tabs are structural anchors and cannot be closed from the tab strip. */
export function closeCanvasTab(state: CanvasTabState, tabId: string): CanvasTabState {
  const index = state.tabs.findIndex((tab) => tab.id === tabId);
  if (index < 0 || state.tabs[index]?.pinned) return state;

  const tabs = state.tabs.filter((tab) => tab.id !== tabId);
  if (state.activeTabId !== tabId) return { tabs, activeTabId: state.activeTabId };
  const neighbour = tabs[index - 1] ?? tabs[index] ?? tabs[0] ?? null;
  return { tabs, activeTabId: neighbour?.id ?? null };
}

export function rememberCanvasTabSession(
  state: CanvasTabState,
  tabId: string,
  session: CanvasTabSession,
): CanvasTabState {
  const tab = state.tabs.find((candidate) => candidate.id === tabId);
  if (!tab) return state;
  return {
    ...state,
    tabs: state.tabs.map((candidate) => candidate.id === tabId ? { ...candidate, ...session } : candidate),
  };
}
