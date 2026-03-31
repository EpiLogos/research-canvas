import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export interface MenuItem {
  type: "item" | "separator" | "header";
  label?: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  submenu?: MenuItem[];
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
    // Focus first item on mount
    const firstBtn = ref.current?.querySelector<HTMLButtonElement>(
      'button.context-menu-item:not([disabled])'
    );
    firstBtn?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const btns = Array.from(
          ref.current?.querySelectorAll<HTMLButtonElement>(
            'button.context-menu-item:not([disabled])'
          ) ?? []
        );
        const idx = btns.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === 'ArrowDown'
          ? (idx + 1) % btns.length
          : (idx - 1 + btns.length) % btns.length;
        btns[next]?.focus();
      }
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
      className="context-menu"
      ref={ref}
      style={{ left: adjustedX, top: adjustedY, position: "fixed", zIndex: 9999 }}
      role="menu"
    >
      {items.map((item, i) => {
        if (item.type === "separator") return <div key={i} className="context-menu-separator" role="separator" />;
        if (item.type === "header") return <div key={i} className="context-menu-header" role="presentation">{item.label}</div>;
        return (
          <button
            key={i}
            className="context-menu-item"
            data-danger={item.danger ? "true" : undefined}
            role="menuitem"
            disabled={item.disabled}
            style={item.disabled ? { opacity: 0.4 } : undefined}
            onClick={() => {
              item.onClick?.();
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
