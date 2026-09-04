import type { AppTab } from "@research-canvas/schema";
import { TabBar } from "./TabBar";

interface TopBarProps {
  projectName?: string | null;
  tabs: AppTab[];
  activeTabId: string | null;
  onActivateTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onOpenPalette: () => void;
  onOpenSettings: () => void;
  onToggleTerminal: () => void;
  terminalActive: boolean;
}

export function TopBar({
  projectName,
  tabs,
  activeTabId,
  onActivateTab,
  onCloseTab,
  onOpenPalette,
  onOpenSettings,
  onToggleTerminal,
  terminalActive,
}: TopBarProps) {
  return (
    <header className="shell-top-bar" data-testid="shell-top-bar">
      <div className="shell-top-bar__project" title={projectName ?? undefined}>
        {projectName ?? "Research Canvas"}
      </div>

      <div className="shell-top-bar__tabs">
        <TabBar
          tabs={tabs}
          activeTabId={activeTabId}
          onActivate={onActivateTab}
          onClose={onCloseTab}
        />
      </div>

      <div className="shell-top-bar__actions">
        <button
          type="button"
          className="shell-top-bar__action"
          aria-label="Command palette"
          title="Command palette (⌘K)"
          onClick={onOpenPalette}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <circle cx="7" cy="7" r="4" />
            <line x1="10.5" y1="10.5" x2="13" y2="13" />
          </svg>
        </button>

        <button
          type="button"
          className="shell-top-bar__action"
          aria-label="Settings"
          title="Settings"
          onClick={onOpenSettings}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <circle cx="8" cy="8" r="2.5" />
            <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M3.2 12.8l1.4-1.4M11.4 4.6l1.4-1.4" />
          </svg>
        </button>

        <button
          type="button"
          className="shell-top-bar__action"
          aria-label="Terminal"
          title="Terminal (⌘J)"
          data-testid="top-bar-terminal-toggle"
          data-active={terminalActive ? "true" : undefined}
          onClick={onToggleTerminal}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M4 5l3 3-3 3" />
            <line x1="8.5" y1="11" x2="12" y2="11" />
          </svg>
        </button>
      </div>
    </header>
  );
}
