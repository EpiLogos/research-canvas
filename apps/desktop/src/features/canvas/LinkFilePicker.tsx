import { useCallback, useState } from "react";

import { FuzzyFilePicker } from "@research-canvas/canvas";
import { readWorkspaceTextFile } from "@research-canvas/desktop-api";

import { useCanvasWorkspace } from "./CanvasWorkspaceContext";

interface LinkFilePickerProps {
  graphNodeId: string;
}

export function LinkFilePicker({ graphNodeId }: LinkFilePickerProps) {
  const workspace = useCanvasWorkspace();
  const [open, setOpen] = useState(false);

  const markdownEntries = workspace.entries
    .filter((entry) => !entry.isDirectory && entry.kind === "markdown")
    .map((entry) => ({ name: entry.name, path: entry.absolutePath, kind: entry.kind }));

  const linkSelected = useCallback(
    async (path: string, name: string) => {
      setOpen(false);
      const markdown = await readWorkspaceTextFile(path);
      await workspace.contentLinkingActions.linkMarkdownFileToNode({
        graphNodeId,
        fileName: name,
        markdown,
      });
    },
    [graphNodeId, workspace.contentLinkingActions],
  );

  return (
    <div className="link-file-picker">
      <button className="link-file-picker__trigger" onClick={() => setOpen(true)}>
        Link a file…
      </button>
      {open && (
        <FuzzyFilePicker
          anchorX={0}
          anchorY={0}
          entries={markdownEntries}
          onClose={() => setOpen(false)}
          onSelect={(entry) => void linkSelected(entry.path, entry.name)}
        />
      )}
    </div>
  );
}
