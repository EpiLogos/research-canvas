import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export interface MenuItem {
  label?: string;
  shortcut?: string;
  action?: () => void;
  separator?: boolean;
  header?: boolean;
  danger?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  const adjustedX = Math.min(x, window.innerWidth - 180);
  const adjustedY = Math.min(y, window.innerHeight - items.length * 28 - 16);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="ctx-menu"
      ref={ref}
      style={{ left: adjustedX, top: adjustedY, position: "fixed", zIndex: 9999 }}
      role="menu"
    >
      {items.map((item, i) => {
        if (item.separator) return <div key={i} className="ctx-separator" />;
        if (item.header) return <div key={i} className="ctx-header">{item.label}</div>;
        return (
          <button
            key={i}
            className="ctx-item"
            data-danger={item.danger ? "true" : undefined}
            role="menuitem"
            onClick={() => {
              item.action?.();
              onClose();
            }}
          >
            <span className="ctx-item__label">{item.label}</span>
            {item.shortcut && (
              <span className="ctx-item__shortcut">{item.shortcut}</span>
            )}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
