import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface FileEntry {
  id: string;
  name: string;
  path: string;
  kind: string;
}

interface FuzzyFilePickerProps {
  x: number;
  y: number;
  entries: FileEntry[];
  onSelect: (entry: FileEntry) => void;
  onClose: () => void;
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

export function FuzzyFilePicker({ x, y, entries, onSelect, onClose }: FuzzyFilePickerProps) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = entries.filter((e) => fuzzyMatch(query, e.name)).slice(0, 8);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

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

  const adjustedX = Math.min(x, window.innerWidth - 220);
  const adjustedY = Math.min(y, window.innerHeight - 260);

  return createPortal(
    <div className="fuzzy-picker" style={{ position: "fixed", left: adjustedX, top: adjustedY, zIndex: 10000 }}>
      <input
        ref={inputRef}
        className="fuzzy-picker__input"
        placeholder="Search files…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKey}
      />
      <div className="fuzzy-picker__list">
        {filtered.length === 0 ? (
          <div className="fuzzy-picker__empty">No matches</div>
        ) : (
          filtered.map((entry, i) => (
            <div
              key={entry.id}
              className="fuzzy-picker__item"
              data-active={i === activeIdx ? "true" : undefined}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => { onSelect(entry); onClose(); }}
            >
              <span className="fuzzy-picker__icon">{entry.kind === "directory" ? "▸" : "·"}</span>
              <span className="fuzzy-picker__name">{entry.name}</span>
              <span className="fuzzy-picker__path">{entry.path.replace(entry.name, "")}</span>
            </div>
          ))
        )}
      </div>
    </div>,
    document.body,
  );
}
