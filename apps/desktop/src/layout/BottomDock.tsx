interface BottomDockProps {
  open: boolean;
  height: number;
  width: number;
  label: string;
  onClose: () => void;
  onResizeStart: (e: React.PointerEvent) => void;
  onWidthResizeStart: (e: React.PointerEvent) => void;
  children: React.ReactNode;
}

export function BottomDock({
  open,
  height,
  width,
  label,
  onClose,
  onResizeStart,
  onWidthResizeStart,
  children
}: BottomDockProps) {
  if (!open) return null;
  return (
    <section className="ishell-dock" data-testid="bottom-dock" style={{ height: `${height}px`, width: `${width}px` }}>
      <div className="ishell-dock__resize ishell-dock__resize--height" onPointerDown={onResizeStart} title="Drag to resize height" />
      <div className="ishell-dock__resize ishell-dock__resize--width" onPointerDown={onWidthResizeStart} title="Drag to resize width" />
      <header className="ishell-dock__bar">
        <span className="ishell-dock__title">{label}</span>
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
