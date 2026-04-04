import { useCallback, useState } from "react";
import { FuzzyFilePicker } from "@research-canvas/canvas";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";
import { SearchPanel } from "../features/search/SearchPanel";
import { AnnotationsPanel } from "../features/annotations/AnnotationsPanel";

interface LeftOverlayProps {
  open: boolean;
  mode: "files" | "search" | "annotations";
  onResizeStart: (e: React.PointerEvent) => void;
  drawingMode?: boolean;
  onToggleDrawing?: () => void;
  strokeColour?: string;
  onSetStrokeColour?: (colour: string) => void;
}

export function LeftOverlay({ open, mode, onResizeStart, drawingMode, onToggleDrawing, strokeColour, onSetStrokeColour }: LeftOverlayProps) {
  const workspace = useCanvasWorkspace();
  const [folderError, setFolderError] = useState<string | null>(null);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [folderEntries, setFolderEntries] = useState<{ name: string; path: string; kind: string }[]>([]);
  const [folderPickerAnchor, setFolderPickerAnchor] = useState<{ x: number; y: number } | null>(null);

  const handleAddFolder = useCallback(async (e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setFolderPickerAnchor({ x: rect.right + 4, y: rect.top });
    setFolderError(null);
    try {
      const dirs = await workspace.listDirectories();
      setFolderEntries(dirs.map((d) => ({ name: d.name, path: d.path, kind: "directory" })));
      setShowFolderPicker(true);
    } catch {
      setFolderError("Failed to scan directories");
    }
  }, [workspace]);

  return (
    <aside className="left-overlay" data-open={open ? "true" : "false"} aria-hidden={!open}>
      <div className="left-overlay__inner">

        {mode === "files" && (
          <>
            {/* Project selector */}
            <div className="lo-section">
              <div className="lo-section__header">
                <span className="lo-label">Projects</span>
              </div>
              <div className="lo-project-list">
                {workspace.projects.map((project) => (
                  <button
                    key={project.id}
                    className="lo-project-item"
                    data-active={workspace.activeProjectId === project.id ? "true" : "false"}
                    onClick={() => workspace.selectProject(project.id)}
                    title={project.rootPath}
                  >
                    {project.name}
                  </button>
                ))}
                {workspace.projects.length === 0 && (
                  <div className="lo-empty">No projects</div>
                )}
              </div>
            </div>

            {/* Resource roots */}
            <div className="lo-section">
              <div className="lo-section__header">
                <span className="lo-label">Resource Folders</span>
                <button
                  className="lo-icon-btn"
                  title="Add folder from machine"
                  onClick={(e) => { void handleAddFolder(e); }}
                >
                  +
                </button>
              </div>
              {folderError && <div className="lo-folder-input__error">{folderError}</div>}
              {showFolderPicker && folderPickerAnchor && (
                <FuzzyFilePicker
                  anchorX={folderPickerAnchor.x}
                  anchorY={folderPickerAnchor.y}
                  entries={folderEntries}
                  onClose={() => setShowFolderPicker(false)}
                  onSelect={async (entry) => {
                    setShowFolderPicker(false);
                    try {
                      await workspace.attachResourceRoot(entry.path);
                    } catch (err) {
                      setFolderError(err instanceof Error ? err.message : String(err));
                    }
                  }}
                />
              )}
              {workspace.resourceRoots.length > 0 ? (
                workspace.resourceRoots.map((root) => (
                  <div key={root.id} className="lo-root-row" title={root.rootPath}>
                    <span className="lo-root-icon">⊞</span>
                    <span className="lo-root-path">{root.rootPath.split("/").pop()}</span>
                    <button
                      className="lo-icon-btn lo-icon-btn--danger"
                      title="Remove folder"
                      onClick={() => { void workspace.detachResourceRoot(root.rootPath); }}
                    >
                      ×
                    </button>
                  </div>
                ))
              ) : (
                <div className="lo-empty">No folders added</div>
              )}
            </div>

            {/* File tree */}
            <div className="lo-section lo-section--grow">
              <div className="lo-section__header">
                <span className="lo-label">Files</span>
              </div>
              <div className="lo-file-list">
                {workspace.entries.map((entry) => (
                  <button
                    key={entry.id}
                    className="lo-file-row"
                    data-selected={workspace.selectedEntryId === entry.id ? "true" : "false"}
                    data-directory={entry.isDirectory ? "true" : "false"}
                    style={{ paddingLeft: `${8 + entry.depth * 12}px` }}
                    onClick={() => workspace.selectEntry(entry.id)}
                    title={entry.relativePath}
                    draggable={!entry.isDirectory}
                    onDragStart={(e) => {
                      if (entry.isDirectory) {
                        e.preventDefault();
                        return;
                      }
                      e.dataTransfer.setData(
                        "application/x-canvas-entry",
                        JSON.stringify({
                          id: entry.id,
                          name: entry.name,
                          relativePath: entry.relativePath,
                          kind: entry.kind,
                        })
                      );
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                  >
                    <span className="lo-file-icon">
                      {entry.isDirectory ? "▸" : "·"}
                    </span>
                    <span className="lo-file-name">{entry.name}</span>
                  </button>
                ))}
                {workspace.entries.length === 0 && (
                  <div className="lo-empty">Add a folder to see files</div>
                )}
              </div>
            </div>
          </>
        )}
        {mode === "search" && <SearchPanel />}
        {mode === "annotations" && (
          <AnnotationsPanel
            drawingMode={drawingMode ?? false}
            onToggleDrawing={onToggleDrawing ?? (() => {})}
            strokeColour={strokeColour ?? "#f97316"}
            onSetStrokeColour={onSetStrokeColour ?? (() => {})}
          />
        )}

      </div>

      {/* Resize handle */}
      <div
        className="left-overlay__resize-handle"
        onPointerDown={onResizeStart}
        title="Drag to resize"
      />
    </aside>
  );
}
