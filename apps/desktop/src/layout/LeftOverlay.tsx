import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";

// @tauri-apps/plugin-dialog is not installed in this project.
// The Add Folder button falls back to window.prompt() for path input.

interface LeftOverlayProps {
  open: boolean;
  onResizeStart: (e: React.PointerEvent) => void;
}

export function LeftOverlay({ open, onResizeStart }: LeftOverlayProps) {
  const workspace = useCanvasWorkspace();

  const handleAddFolder = async () => {
    // plugin-dialog is not installed; use window.prompt as fallback
    const selected = window.prompt("Enter absolute path to resource folder:");
    if (selected && selected.trim().length > 0) {
      try {
        await workspace.attachResourceRoot(selected.trim());
      } catch {
        // user cancelled or attach failed
      }
    }
  };

  return (
    <aside className="left-overlay" data-open={open ? "true" : "false"} aria-hidden={!open}>
      <div className="left-overlay__inner">

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
              onClick={() => { void handleAddFolder(); }}
            >
              +
            </button>
          </div>
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
