import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";

interface LeftOverlayProps {
  open: boolean;
  onClose: () => void;
  onResizeStart: (e: React.PointerEvent) => void;
}

export function LeftOverlay({ open, onClose: _onClose, onResizeStart }: LeftOverlayProps) {
  const workspace = useCanvasWorkspace();

  return (
    <aside className="left-overlay" data-open={open ? "true" : "false"} aria-hidden={!open}>
      <div className="left-overlay__inner">
        {/* Project selector */}
        <div className="lo-section">
          <div className="lo-section__header">
            <span className="lo-label">Project</span>
            <button className="lo-icon-btn" title="New project">+</button>
          </div>
          <div className="lo-project-name">
            {workspace.activeProject?.name ?? "No project selected"}
          </div>
        </div>

        {/* Canvas switcher */}
        <div className="lo-section">
          <div className="lo-section__header">
            <span className="lo-label">Canvas</span>
            <button className="lo-icon-btn" title="New canvas">+</button>
          </div>
          <div className="lo-canvas-list">
            <div className="lo-canvas-item lo-canvas-item--active">Default Canvas</div>
          </div>
        </div>

        {/* Resource roots */}
        <div className="lo-section">
          <div className="lo-section__header">
            <span className="lo-label">Resource Folders</span>
            <button
              className="lo-icon-btn"
              title="Add folder from machine"
            >
              +
            </button>
          </div>
          {workspace.resourceRoots?.length ? (
            workspace.resourceRoots.map((root) => (
              <div key={root.id} className="lo-root-row" title={root.rootPath}>
                <span className="lo-root-icon">⊞</span>
                <span className="lo-root-path">{root.rootPath.split("/").pop()}</span>
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
            {workspace.entries?.map((entry) => (
              <div key={entry.id} className="lo-file-row">
                <span className="lo-file-icon">{entry.kind === "directory" ? "▸" : "·"}</span>
                <span className="lo-file-name">{entry.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Resize handle on right edge */}
      <div
        className="left-overlay__resize-handle"
        onPointerDown={onResizeStart}
        title="Drag to resize"
      />
    </aside>
  );
}
