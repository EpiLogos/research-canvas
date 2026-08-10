import { useCallback, useMemo, useState } from "react";
import { FuzzyFilePicker } from "@research-canvas/canvas";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";
import { SearchPanel } from "../features/search/SearchPanel";
import { AnnotationsPanel } from "../features/annotations/AnnotationsPanel";

interface LeftOverlayProps {
  open: boolean;
  mode: "files" | "search" | "annotations";
  onResizeStart: (e: React.PointerEvent) => void;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
  drawingMode?: boolean;
  onToggleDrawing?: () => void;
  strokeColour?: string;
  onSetStrokeColour?: (colour: string) => void;
}

export function LeftOverlay({ open, mode, onResizeStart, onInteractionStart, onInteractionEnd, drawingMode, onToggleDrawing, strokeColour, onSetStrokeColour }: LeftOverlayProps) {
  const workspace = useCanvasWorkspace();
  const [folderError, setFolderError] = useState<string | null>(null);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [folderEntries, setFolderEntries] = useState<{ name: string; path: string; kind: string }[]>([]);
  const [folderPickerAnchor, setFolderPickerAnchor] = useState<{ x: number; y: number } | null>(null);
  const [browserView, setBrowserView] = useState<"graph" | "files">("graph");
  const [filter, setFilter] = useState("");
  const hasProject = Boolean(workspace.activeConstellationId || workspace.activeProjectId);
  const hasProfile = Boolean(workspace.activeProfileScope);
  // Only gate on project/profile selection once the workspace has bootstrapped
  // (databasePath is set). Before boot resolves we optimistically render the
  // mode content; after boot, a missing project/profile is explained by the
  // informative empty state instead of a dead panel.
  const needsProjectSelection =
    Boolean(workspace.databasePath) && (!hasProject || !hasProfile);
  const activeProjectName =
    workspace.activeConstellation?.displayName ??
    workspace.constellations.find(
      (constellation) => constellation.id === workspace.activeProjectId,
    )?.name ??
    null;
  const constellationRows = useMemo(() => {
    const byId = new Map(workspace.constellations.map((constellation) => [constellation.id, constellation]));
    const childrenByParent = new Map<string | null, typeof workspace.constellations>();
    for (const constellation of workspace.constellations) {
      const parentId = constellation.parentId && byId.has(constellation.parentId)
        ? constellation.parentId
        : null;
      childrenByParent.set(parentId, [
        ...(childrenByParent.get(parentId) ?? []),
        constellation,
      ]);
    }

    const rows: Array<{ constellation: typeof workspace.constellations[number]; depth: number; childCount: number }> = [];
    const visit = (parentId: string | null, depth: number) => {
      for (const constellation of childrenByParent.get(parentId) ?? []) {
        const children = childrenByParent.get(constellation.id) ?? [];
        rows.push({ constellation, depth, childCount: children.length });
        visit(constellation.id, depth + 1);
      }
    };
    visit(null, 0);
    return rows;
  }, [workspace.constellations]);

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
    <aside
      className="left-overlay"
      data-testid="left-overlay"
      data-open={open ? "true" : "false"}
      data-left-mode={mode}
      data-browser-surface="true"
      aria-hidden={!open}
      onPointerEnter={onInteractionStart}
      onPointerLeave={onInteractionEnd}
      onFocusCapture={onInteractionStart}
      onBlurCapture={(event) => {
        const surface = event.currentTarget;
        window.setTimeout(() => {
          if (!surface.contains(document.activeElement)) onInteractionEnd?.();
        }, 0);
      }}
    >
      <div className="left-overlay__inner">

        {!needsProjectSelection && (
          <div className="lo-project-scope" data-testid="lo-project-scope">
            <span className="lo-label">Project</span>
            <span className="lo-project-scope__name" data-testid="lo-project-scope-name">
              {activeProjectName ?? "Untitled project"}
            </span>
            {workspace.activeProfileScope && (
              <span className="lo-project-scope__profile" data-testid="lo-project-scope-profile">
                {workspace.activeProfileScope}
              </span>
            )}
          </div>
        )}

        {needsProjectSelection ? (
          <div
            className="lo-empty lo-empty--project-scope"
            data-testid="lo-empty-project-selection"
          >
            {!hasProject
              ? "No project selected. Choose a project from the top of the left rail to explore its files, search, and annotations."
              : "No profile scope is active for this project. Select a project from the top of the left rail."}
          </div>
        ) : (
          <>
        {mode === "files" && (
          <>
            <header className="explorer-heading">
              <span className="explorer-heading__eyebrow">Workspace explorer</span>
              <span className="explorer-heading__detail">Constellations are independent canvases</span>
            </header>
            <div className="lo-section">
              <div className="lo-section__header">
                <span className="lo-label">Constellations</span>
              </div>
              <div className="lo-constellation-list" data-testid="lo-constellations">
                {constellationRows.map(({ constellation, depth, childCount }) => (
                  <button
                    key={constellation.id}
                    className="lo-constellation-item"
                    data-active={workspace.activeConstellationId === constellation.id ? "true" : "false"}
                    data-depth={depth}
                    aria-current={workspace.activeConstellationId === constellation.id ? "page" : undefined}
                    style={{ paddingLeft: `${10 + depth * 14}px` }}
                    onClick={() => {
                      const openConstellation = workspace.openConstellationTab ?? workspace.selectConstellation;
                      void openConstellation(constellation.id);
                    }}
                    title={constellation.summary || constellation.rootPath}
                  >
                    <span className="lo-constellation-item__line">
                      <span className="lo-constellation-item__branch" aria-hidden="true">
                        {childCount > 0 ? "⌁" : "·"}
                      </span>
                      <span className="lo-constellation-item__name">
                        {constellation.name}
                      </span>
                    </span>
                    {constellation.summary && (
                      <span className="lo-constellation-item__summary">{constellation.summary}</span>
                    )}
                    <span className="lo-constellation-item__meta">
                      {depth === 0 ? "root canvas" : "nested constellation"}
                      {childCount > 0 ? ` · ${childCount} child${childCount === 1 ? "" : "ren"}` : ""}
                    </span>
                  </button>
                ))}
                {workspace.constellations.length === 0 && (
                  <div className="lo-empty">No constellations</div>
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
                            absolutePath: entry.absolutePath,
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
          </>
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
