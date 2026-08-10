import { useCallback, useEffect, useRef, useState } from "react";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";
import type { HomeProject } from "@research-canvas/desktop-api";

/**
 * The left rail's projects layer (refinement-2 D8, task 10).
 *
 * A picker + project state at the top of the rail: it resolves the research
 * canvas home, lists the projects under it, shows the active project, and
 * routes selection into the existing surfaces via the real transport
 * (`resolveOrCreateHome`, `selectProject`, `createProject`). It is NOT a new
 * store and owns no persistence — project state already lives in
 * `CanvasWorkspaceContext` + the transport.
 */
export function ProjectsLayer() {
  const workspace = useCanvasWorkspace();
  const [open, setOpen] = useState(false);
  const [homePath, setHomePath] = useState<string | null>(null);
  const [homeProjects, setHomeProjects] = useState<HomeProject[]>([]);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Resolve the research-canvas home once the workspace has bootstrapped a
  // database path. The home list is the picker's real data — projects under
  // the home, returned by the real transport seam.
  useEffect(() => {
    if (!workspace.databasePath) return;
    let cancelled = false;
    void workspace
      .resolveOrCreateHome({ databasePath: workspace.databasePath })
      .then((result) => {
        if (cancelled) return;
        setHomePath(result.homePath);
        setHomeProjects(result.projects);
        setHomeError(null);
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setHomeError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [workspace]);

  // Click-outside closes the popover.
  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (
        rootRef.current &&
        event.target instanceof Node &&
        !rootRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const activeProjectName =
    workspace.activeConstellation?.displayName ??
    homeProjects.find((project) => project.id === workspace.activeProjectId)?.name ??
    workspace.constellations.find((constellation) => constellation.id === workspace.activeProjectId)
      ?.name ??
    null;

  const handleSelect = useCallback(
    async (projectId: string) => {
      setOpen(false);
      setActionError(null);
      try {
        await workspace.selectProject(projectId);
      } catch (error) {
        setActionError(error instanceof Error ? error.message : String(error));
      }
    },
    [workspace],
  );

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name || !workspace.databasePath || !homePath) return;
    setCreating(true);
    setActionError(null);
    try {
      const project = await workspace.createProject({
        databasePath: workspace.databasePath,
        homePath,
        name,
        rootType: "directory",
      });
      setNewName("");
      setHomeProjects((current) => {
        if (current.some((existing) => existing.id === project.id)) return current;
        return [
          ...current,
          {
            id: project.id,
            name: project.displayName,
            slug: project.slug,
            rootPath: project.rootPath,
            rootType: project.rootType,
            profileScope: project.profileScope,
            summary: project.summary,
            parentId: project.parentConstellationId,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
          },
        ];
      });
      await workspace.selectProject(project.id);
      setOpen(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setCreating(false);
    }
  }, [homePath, newName, workspace]);

  return (
    <div
      className="projects-layer"
      data-testid="projects-layer-root"
      ref={rootRef}
    >
      <button
        type="button"
        className="icon-strip__btn projects-layer__trigger"
        data-testid="projects-trigger"
        aria-expanded={open ? "true" : "false"}
        aria-label="Projects"
        title={activeProjectName ? `Project: ${activeProjectName}` : "No project selected"}
        onClick={() => setOpen((value) => !value)}
        dangerouslySetInnerHTML={{
          __html: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 5h4l1.5 2H14v6H2z"/><path d="M2 5V3h3.5l1.5 2"/></svg>`,
        }}
      />
      {open && (
        <div className="projects-layer__popover" data-testid="projects-layer" data-browser-surface="true">
          <div className="projects-layer__header">
            <span className="projects-layer__label">Projects</span>
            {workspace.activeProfileScope && (
              <span className="projects-layer__scope" data-testid="projects-active-scope">
                {workspace.activeProfileScope}
              </span>
            )}
          </div>

          {activeProjectName && (
            <div className="projects-layer__active" data-testid="projects-active-name">
              {activeProjectName}
            </div>
          )}

          <div className="projects-layer__list" data-testid="projects-list">
            {homeProjects.length === 0 && !homeError && (
              <div className="lo-empty">No projects yet — create one below.</div>
            )}
            {homeError && <div className="lo-folder-input__error">{homeError}</div>}
            {homeProjects.map((project) => (
              <button
                key={project.id}
                type="button"
                className="projects-layer__project"
                data-active={project.id === workspace.activeProjectId ? "true" : "false"}
                data-testid={`project-row-${project.id}`}
                onClick={() => { void handleSelect(project.id); }}
                title={project.summary || project.rootPath}
              >
                <span className="projects-layer__project-name">{project.name}</span>
                <span className="projects-layer__project-scope">{project.profileScope}</span>
              </button>
            ))}
          </div>

          <div className="projects-layer__create">
            <input
              className="lo-folder-input__field"
              data-testid="projects-new-name"
              placeholder="New project name"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") { void handleCreate(); }
              }}
            />
            <button
              type="button"
              className="lo-folder-input__btn"
              data-testid="projects-create"
              disabled={creating || !newName.trim()}
              onClick={() => { void handleCreate(); }}
            >
              {creating ? "Creating…" : "Create"}
            </button>
          </div>

          {actionError && <div className="lo-folder-input__error">{actionError}</div>}
        </div>
      )}
    </div>
  );
}
