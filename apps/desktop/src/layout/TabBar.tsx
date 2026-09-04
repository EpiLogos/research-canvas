import type { AppTab } from "@research-canvas/schema";

interface TabBarProps {
  tabs: AppTab[];
  activeTabId: string | null;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
}

const SURFACE_LABELS: Record<AppTab["surfaceId"], string> = {
  projects: "Projects",
  canvas: "Canvas",
  timeline: "Timeline",
  places: "Places",
  story: "Story",
  palace: "Palace",
};

/**
 * Global tab bar showing every open AppTab. Clicking a tab activates it;
 * un-pinned tabs can be closed. The shell derives its lens from the active
 * tab's surface.
 */
export function TabBar({ tabs, activeTabId, onActivate, onClose }: TabBarProps) {
  if (tabs.length === 0) return null;

  return (
    <nav className="app-tabbar" aria-label="Open surfaces" role="tablist" data-testid="app-tabbar">
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        return (
          <div className="app-tabbar__item" key={tab.id} data-active={active ? "true" : "false"}>
            <button
              type="button"
              className="app-tabbar__tab"
              role="tab"
              aria-label={tab.title}
              aria-selected={active}
              title={tab.title}
              onClick={() => onActivate(tab.id)}
            >
              <span className="app-tabbar__surface">{SURFACE_LABELS[tab.surfaceId]}</span>
              <span className="app-tabbar__label">{tab.title}</span>
              {tab.pinned ? (
                <span className="app-tabbar__pin" aria-hidden="true" title="Pinned tab">
                  ◆
                </span>
              ) : null}
            </button>
            {!tab.pinned ? (
              <button
                type="button"
                className="app-tabbar__close"
                aria-label={`Close ${tab.title}`}
                title={`Close ${tab.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(tab.id);
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
