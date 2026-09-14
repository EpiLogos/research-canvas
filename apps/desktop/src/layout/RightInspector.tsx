import type { ReactNode } from "react";
import { InspectorTab } from "../features/inspector/InspectorTab";

interface RightInspectorProps {
  open: boolean;
  pinned: boolean;
  onTogglePin: () => void;
  onClose: () => void;
  onResizeStart: (e: React.PointerEvent) => void;
  flowView: ReactNode;
}

export function RightInspector({
  open,
  pinned,
  onTogglePin,
  onClose,
  onResizeStart,
  flowView,
}: RightInspectorProps) {
  if (!open) return null;

  return (
    <aside
      className="shell-right-inspector"
      data-testid="shell-right-inspector"
      data-pinned={pinned ? "true" : "false"}
    >
      <div
        className="shell-right-inspector__resize"
        onPointerDown={onResizeStart}
        aria-label="Resize inspector"
        role="separator"
      />

      <div className="shell-right-inspector__bar">
        <span className="shell-right-inspector__title">Inspector</span>
        <div className="shell-right-inspector__actions">
          <button
            type="button"
            className="shell-right-inspector__action"
            aria-label={pinned ? "Unpin inspector" : "Pin inspector"}
            title={pinned ? "Unpin inspector" : "Pin inspector"}
            data-pinned={pinned ? "true" : "false"}
            onClick={onTogglePin}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M8 1.5v9M4 7l4-4 4 4" />
            </svg>
          </button>

          <button
            type="button"
            className="shell-right-inspector__action"
            aria-label="Close inspector"
            title="Close inspector"
            onClick={onClose}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <line x1="4" y1="4" x2="12" y2="12" />
              <line x1="12" y1="4" x2="4" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="shell-right-inspector__body">
        <InspectorTab flowView={flowView} />
      </div>
    </aside>
  );
}
