import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface FileEntry {
  name: string;
  path: string;
  id?: string;
  kind?: string;
}

interface FuzzyFilePickerProps {
  entries: FileEntry[];
  onSelect: (entry: FileEntry) => void;
  onClose: () => void;
  anchorX: number;
  anchorY: number;
}

function fuzzyMatch(query: string, str: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const s = str.toLowerCase();
  let qi = 0;
  for (let i = 0; i < s.length && qi < q.length; i++) {
    if (s[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

export function FuzzyFilePicker({ anchorX, anchorY, entries, onSelect, onClose }: FuzzyFilePickerProps) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () => entries.filter((e) => fuzzyMatch(query, e.name)).slice(0, 8),
    [entries, query]
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // Outside-click dismissal
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [onClose]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[activeIdx]) {
        onSelect(filtered[activeIdx]);
        onClose();
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  const adjustedX = Math.min(anchorX, window.innerWidth - 220);
  const adjustedY = Math.min(anchorY, window.innerHeight - 260);

  return createPortal(
    <div ref={containerRef} className="fuzzy-picker" style={{ position: "fixed", left: adjustedX, top: adjustedY, zIndex: 10000 }}>
      <input
        ref={inputRef}
        className="fuzzy-picker-input"
        placeholder="Search files…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKey}
      />
      <div className="fuzzy-picker-list">
        {filtered.length === 0 ? (
          <div className="fuzzy-picker__empty">No matches</div>
        ) : (
          filtered.map((entry, i) => (
            <div
              key={entry.id ?? entry.path}
              className="fuzzy-picker-item"
              data-active={i === activeIdx ? "true" : undefined}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => { onSelect(entry); onClose(); }}
            >
              <span className="fuzzy-picker__icon">{entry.kind === "directory" ? "▸" : "·"}</span>
              <span className="fuzzy-picker__name">{entry.name}</span>
              <span className="fuzzy-picker__path">{entry.name ? entry.path.slice(0, entry.path.lastIndexOf(entry.name)) : entry.path}</span>
            </div>
          ))
        )}
      </div>
    </div>,
    document.body,
  );
}
