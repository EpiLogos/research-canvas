import type { TimelineViewState } from "@research-canvas/desktop-api";
import type { AppTab, SurfaceTabState } from "@research-canvas/schema";

/** Structural view of the existing tab manager; storage remains its owner. */
export interface TimelineTabPersistenceTarget {
  readonly activeTabId: string | null;
  readonly tabs: readonly AppTab[];
  updateState(tabId: string, state: SurfaceTabState): void;
}

/**
 * Publish only for the tab/constellation which created the callback. Reading
 * `activeTabId` as the destination at callback time lets a departing Timeline
 * overwrite a newly selected Timeline. Preserve the complete existing state:
 * replacing it with camera fields alone used to discard its durable owner.
 *
 * An unbound legacy active tab may acquire its current constellation here;
 * an already bound tab must never be transferred to another constellation.
 */
export function persistTimelineTabState(
  manager: TimelineTabPersistenceTarget,
  originatingTabId: string | null,
  constellationId: string | null,
  view: TimelineViewState,
): boolean {
  if (!originatingTabId || !constellationId || manager.activeTabId !== originatingTabId) return false;
  const tab = manager.tabs.find((candidate) => candidate.id === originatingTabId);
  if (tab?.surfaceId !== "timeline" || tab.state.surfaceId !== "timeline") return false;
  const current = tab.state;
  if (current.constellationId && current.constellationId !== constellationId) return false;
  if (!Number.isFinite(view.centerYear) || !Number.isFinite(view.pixelsPerYear) || view.pixelsPerYear <= 0) return false;

  if (
    current.constellationId === constellationId
    && current.centerYear === view.centerYear
    && current.pixelsPerYear === view.pixelsPerYear
    && (current.selectedGraphNodeId ?? null) === view.selectedNodeId
  ) return false;

  manager.updateState(originatingTabId, {
    ...current,
    constellationId,
    centerYear: view.centerYear,
    pixelsPerYear: view.pixelsPerYear,
    selectedGraphNodeId: view.selectedNodeId,
  });
  return true;
}
