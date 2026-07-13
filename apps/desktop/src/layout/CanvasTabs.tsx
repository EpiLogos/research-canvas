interface CanvasTabItem {
  id: string;
  label: string;
  pinned: boolean;
}

interface CanvasTabsProps {
  tabs: CanvasTabItem[];
  activeTabId: string | null;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
}

/** A narrow workbench strip: tabs represent open canvases, never the timeline. */
export function CanvasTabs({ tabs, activeTabId, onActivate, onClose }: CanvasTabsProps) {
  if (tabs.length === 0) return null;

  return (
    <nav className="canvas-tabs" aria-label="Open constellations" role="tablist">
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        return (
          <div className="canvas-tabs__item" key={tab.id} data-active={active ? "true" : "false"}>
            <button
              type="button"
              className="canvas-tabs__tab"
              role="tab"
              aria-label={tab.label}
              aria-selected={active}
              title={tab.label}
              onClick={() => onActivate(tab.id)}
            >
              <span className="canvas-tabs__label">{tab.label}</span>
              {tab.pinned ? <span className="canvas-tabs__pin" aria-hidden="true" title="Pinned root tab">◆</span> : null}
            </button>
            {!tab.pinned ? (
              <button
                type="button"
                className="canvas-tabs__close"
                aria-label={`Close ${tab.label}`}
                title={`Close ${tab.label}`}
                onClick={() => onClose(tab.id)}
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
