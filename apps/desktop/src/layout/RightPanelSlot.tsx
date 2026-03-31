import { TerminalPane } from "../features/terminal/TerminalPane";
import { ContentTab } from "../features/viewer/ContentTab";
import { InspectorTab } from "../features/inspector/InspectorTab";
import type { RightTab } from "./useShellLayout";

interface RightPanelSlotProps {
  open: boolean;
  activeTab: RightTab;
  onTabChange: (tab: RightTab) => void;
  onClose: () => void;
  onResizeStart: (e: React.PointerEvent) => void;
  onFullScreen?: () => void;
}

const TABS: { id: RightTab; label: string }[] = [
  { id: "inspector", label: "Inspector" },
  { id: "content", label: "Content" },
  { id: "terminal", label: "Terminal" },
];

export function RightPanelSlot({
  open,
  activeTab,
  onTabChange,
  onClose,
  onResizeStart,
  onFullScreen,
}: RightPanelSlotProps) {
  return (
    <aside className="right-panel-slot" data-open={open ? "true" : "false"} aria-hidden={!open} data-testid="right-panel">
      {/* Resize handle on left edge */}
      <div
        className="right-panel-slot__resize-handle"
        onPointerDown={onResizeStart}
        title="Drag to resize"
      />

      <div className="right-panel-slot__inner">
        {/* Tab bar */}
        <div className="rps-tabbar">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className="rps-tab"
              data-active={activeTab === tab.id ? "true" : "false"}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
          <button className="rps-close" onClick={onClose} title="Close panel">
            ✕
          </button>
        </div>

        {/* Tab content — all panes always mounted so Terminal session persists */}
        <div className="rps-body">
          <div className="rps-pane" data-visible={activeTab === "inspector" ? "true" : "false"}>
            <InspectorTab />
          </div>
          <div className="rps-pane" data-visible={activeTab === "content" ? "true" : "false"}>
            <ContentTab onFullScreen={onFullScreen ?? (() => {})} />
          </div>
          <div className="rps-pane" data-visible={activeTab === "terminal" ? "true" : "false"}>
            <TerminalPane />
          </div>
        </div>
      </div>
    </aside>
  );
}
