import { useCallback, useState } from "react";
import { FuzzyFilePicker } from "@research-canvas/canvas";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";
import { SearchPanel } from "../features/search/SearchPanel";
import { AnnotationsPanel } from "../features/annotations/AnnotationsPanel";

interface LeftOverlayProps {
  open: boolean;
  mode: "files" | "search" | "annotations";
  onResizeStart: (e: React.PointerEvent) => void;
  onClose?: () => void;
  drawingMode?: boolean;
  onToggleDrawing?: () => void;
  strokeColour?: string;
  onSetStrokeColour?: (colour: string) => void;
}

export function LeftOverlay({ open, mode, onResizeStart, onClose, drawingMode, onToggleDrawing, strokeColour, onSetStrokeColour }: LeftOverlayProps) {
  const workspace = useCanvasWorkspace();
  const [folderError, setFolderError] = useState<string | null>(null);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [folderEntries, setFolderEntries] = useState<{ name: string; path: string; kind: string }[]>([]);
  const [folderPickerAnchor, setFolderPickerAnchor] = useState<{ x: number; y: number } | null>(null);
  const [browserView, setBrowserView] = useState<"graph" | "files">("graph");
  const [filter, setFilter] = useState("");

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
    <aside className="left-overlay" data-testid="left-overlay" data-open={open ? "true" : "false"} aria-hidden={!open}>
      <button
        type="button"
        className="left-overlay__close"
        aria-label="Close panel"
        onClick={() => onClose?.()}
      >
        ×
      </button>
      <div className="left-overlay__inner">

        {mode === "files" && (
          <>
            {/* Project selector — always visible in files mode, regardless
                of the Graph/Files sub-view, so it doesn't look buried behind
                the segmented control below. */}
            <div className="lo-section">
              <div className="lo-section__header">
                <span className="lo-label">Projects</span>
              </div>
              <div className="lo-project-list" data-testid="lo-projects">
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

            <div className="lo-browser-controls">
              <div className="lo-seg" role="tablist" aria-label="Browser view">
                <button
                  type="button"
                  data-testid="browser-graph"
                  data-active={browserView === "graph" ? "true" : "false"}
                  onClick={() => setBrowserView("graph")}
                >
                  Graph
                </button>
                <button
                  type="button"
                  data-testid="browser-files"
                  data-active={browserView === "files" ? "true" : "false"}
                  onClick={() => setBrowserView("files")}
                >
                  Files
                </button>
              </div>
              <input
                className="lo-filter"
                data-testid="browser-filter"
                placeholder="Filter…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>

            {browserView === "graph" && (
              <div className="lo-section lo-section--grow">
                {(() => {
                  const q = filter.trim().toLowerCase();
                  const matches = workspace.nodes.filter(
                    (n) => !q || n.title.toLowerCase().includes(q),
                  );
                  const groups = new Map<string, typeof matches>();
                  for (const n of matches) {
                    const arr = groups.get(n.type) ?? [];
                    arr.push(n);
                    groups.set(n.type, arr);
                  }
                  if (matches.length === 0) {
                    return <div className="lo-empty">No matching nodes</div>;
                  }
                  return Array.from(groups.entries()).map(([type, ns]) => (
                    <div key={type}>
                      <div className="lo-section__header">
                        <span className="lo-label">{type} · {ns.length}</span>
                      </div>
                      <div className="lo-file-list">
                        {ns.map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            className="lo-file-row"
                            data-testid={`graph-node-${n.id}`}
                            onClick={() => workspace.selectNode(n.id)}
                            title={n.title}
                          >
                            <span className="lo-file-icon">·</span>
                            <span className="lo-file-name">{n.title}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}

            {browserView === "files" && (
              <>
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
                          const payload = JSON.stringify({
                            id: entry.id,
                            name: entry.name,
                            relativePath: entry.relativePath,
                            kind: entry.kind,
                          });
                          e.dataTransfer.setData("application/x-canvas-entry", payload);
                          e.dataTransfer.setData("text/plain", payload);
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
