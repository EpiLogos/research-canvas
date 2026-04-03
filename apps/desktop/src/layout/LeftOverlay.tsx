import { useCallback, useRef, useState } from "react";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";

interface LeftOverlayProps {
  open: boolean;
  mode: "files" | "search" | "annotations";
  onResizeStart: (e: React.PointerEvent) => void;
}

export function LeftOverlay({ open, mode, onResizeStart }: LeftOverlayProps) {
  const workspace = useCanvasWorkspace();
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [folderPath, setFolderPath] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleAddFolder = useCallback(async () => {
    const trimmed = folderPath.trim();
    if (!trimmed) return;
    setFolderError(null);
    try {
      await workspace.attachResourceRoot(trimmed);
      setFolderPath("");
      setShowFolderInput(false);
    } catch (err) {
      setFolderError(err instanceof Error ? err.message : String(err));
    }
  }, [folderPath, workspace]);

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
                  onClick={() => {
                    setShowFolderInput((v) => !v);
                    setFolderError(null);
                    setTimeout(() => folderInputRef.current?.focus(), 50);
                  }}
                >
                  +
                </button>
              </div>
              {showFolderInput && (
                <div className="lo-folder-input">
                  <input
                    ref={folderInputRef}
                    className="lo-folder-input__field"
                    type="text"
                    placeholder="/path/to/folder"
                    value={folderPath}
                    onChange={(e) => setFolderPath(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { void handleAddFolder(); }
                      if (e.key === "Escape") { setShowFolderInput(false); setFolderPath(""); }
                    }}
                  />
                  <button
                    className="lo-folder-input__btn"
                    onClick={() => { void handleAddFolder(); }}
                    disabled={!folderPath.trim()}
                  >
                    Add
                  </button>
                  {folderError && <div className="lo-folder-input__error">{folderError}</div>}
                </div>
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
        {mode === "search" && (
          <div className="lo-section lo-section--grow">
            <div className="lo-section__header">
              <span className="lo-label">Search</span>
            </div>
            <div className="lo-empty">Search panel — coming in Task 4</div>
          </div>
        )}
        {mode === "annotations" && (
          <div className="lo-section lo-section--grow">
            <div className="lo-section__header">
              <span className="lo-label">Annotations</span>
            </div>
            <div className="lo-empty">Annotations panel — coming in Task 8</div>
          </div>
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
