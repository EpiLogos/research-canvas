interface BottomDockProps {
  open: boolean;
  height: number;
  title: string;
  onClose: () => void;
  onResizeStart: (e: React.PointerEvent) => void;
  children: React.ReactNode;
}

export function BottomDock({ open, height, title, onClose, onResizeStart, children }: BottomDockProps) {
  if (!open) return null;
  return (
    <section className="ishell-dock" data-testid="bottom-dock" style={{ height: `${height}px` }}>
      <div className="ishell-dock__resize" onPointerDown={onResizeStart} title="Drag to resize" />
      <header className="ishell-dock__bar">
        <span className="ishell-dock__title">{title}</span>
        <button
          type="button"
          className="ishell-dock__close"
          aria-label="Close terminal"
          onClick={onClose}
        >
          ✕
        </button>
      </header>
      <div className="ishell-dock__body">{children}</div>
    </section>
  );
}
