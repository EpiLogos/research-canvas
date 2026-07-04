interface InspectorOverlayProps {
  open: boolean;
  pinned: boolean;
  width: number;
  onTogglePin: () => void;
  onClose: () => void;
  onResizeStart: (e: React.PointerEvent) => void;
  children: React.ReactNode;
}

export function InspectorOverlay({ open, pinned, width, onTogglePin, onClose, onResizeStart, children }: InspectorOverlayProps) {
  if (!open) return null;
  return (
    <aside className="ishell-inspector" data-testid="inspector-overlay" style={{ width: `${width}px` }}>
      <div className="ishell-inspector__resize" onPointerDown={onResizeStart} title="Drag to resize" />
      <header className="ishell-inspector__bar">
        <span className="ishell-inspector__title">Inspector</span>
        <button
          type="button"
          className="ishell-inspector__pin"
          aria-label="Pin inspector"
          data-pinned={pinned ? "true" : "false"}
          onClick={onTogglePin}
        >
          ⚲
        </button>
        <button
          type="button"
          className="ishell-inspector__close"
          aria-label="Close inspector"
          onClick={onClose}
        >
          ✕
        </button>
      </header>
      <div className="ishell-inspector__body">{children}</div>
    </aside>
  );
}
