import { useMemo, useRef, useState } from "react";

import { FuzzyFilePicker, type FileEntry } from "@research-canvas/canvas";
import type { IndexedEntry } from "@research-canvas/desktop-api";

interface WorkspaceFilePickerButtonProps {
  buttonClassName?: string;
  buttonLabel: string;
  entries: IndexedEntry[];
  filter?: (entry: IndexedEntry) => boolean;
  onSelect: (entry: IndexedEntry) => void;
  type?: "button" | "submit";
}

export function WorkspaceFilePickerButton({
  buttonClassName,
  buttonLabel,
  entries,
  filter,
  onSelect,
  type = "button",
}: WorkspaceFilePickerButtonProps) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const filteredEntries = useMemo(
    () => entries.filter((entry) => !entry.isDirectory).filter((entry) => filter?.(entry) ?? true),
    [entries, filter],
  );

  const pickerEntries = useMemo<FileEntry[]>(
    () =>
      filteredEntries.map((entry) => ({
        absolutePath: entry.absolutePath,
        id: entry.id,
        kind: entry.kind,
        name: entry.name,
        path: entry.relativePath,
        relativePath: entry.relativePath,
      })),
    [filteredEntries],
  );

  const openPicker = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    setAnchor({
      x: rect.left,
      y: rect.bottom + 6,
    });
  };

  return (
    <>
      <button
        className={buttonClassName}
        onClick={openPicker}
        ref={buttonRef}
        type={type}
      >
        {buttonLabel}
      </button>
      {anchor ? (
        <FuzzyFilePicker
          anchorX={anchor.x}
          anchorY={anchor.y}
          entries={pickerEntries}
          onClose={() => setAnchor(null)}
          onSelect={(selected) => {
            const entry = filteredEntries.find(
              (candidate) =>
                candidate.id === selected.id ||
                candidate.relativePath === selected.path,
            );
            if (entry) {
              onSelect(entry);
            }
            setAnchor(null);
          }}
        />
      ) : null}
    </>
  );
}
