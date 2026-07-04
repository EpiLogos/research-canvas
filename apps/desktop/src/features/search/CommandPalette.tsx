import { useEffect, useState } from "react";

import { useSearch } from "./useSearch";

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onSetLens?: (lens: "canvas" | "timeline" | "reading") => void;
  onToggleTerminal?: () => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  onSetLens,
  onToggleTerminal
}: CommandPaletteProps) {
  if (!isOpen) {
    return null;
  }

  return <CommandPaletteDialog onClose={onClose} onSetLens={onSetLens} onToggleTerminal={onToggleTerminal} />;
}

function CommandPaletteDialog({
  onClose,
  onSetLens,
  onToggleTerminal
}: Omit<CommandPaletteProps, "isOpen">) {
  const [query, setQuery] = useState("");
  const items = useSearch(query, { onSetLens, onToggleTerminal });

  useEffect(() => {
    setQuery("");
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="command-palette__backdrop" onClick={onClose}>
      <section
        aria-label="Command palette"
        className="command-palette"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <label className="command-palette__search">
          <span className="eyebrow">Search</span>
          <input
            aria-label="Search workspace"
            autoFocus
            placeholder="Search files, nodes, sequences, and commands"
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="command-palette__results">
          {query.trim().length === 0 ? (
            <p>Type to search the workspace.</p>
          ) : items.length === 0 ? (
            <p>No results yet.</p>
          ) : (
            items.map((item) => (
              <button
                aria-label={`${item.title} ${item.kind}`}
                className="command-palette__item"
                key={item.id}
                type="button"
                onClick={() => {
                  item.onSelect();
                  onClose();
                }}
              >
                <strong>{item.title}</strong>
                <span>{item.kind}</span>
                <p>{item.summary}</p>
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
