import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";
import { useProjectTree } from "./useProjectTree";
import type {
  ProjectTreeCanvas,
  ProjectTreeConstellation,
  ProjectTreeGraphNode,
  ProjectTreeScene,
  ProjectTreeSequence,
} from "./types";
import type { SurfaceId, SurfaceTabState } from "@research-canvas/schema";

const CONTEXT_MENU_SURFACES: { surfaceId: Exclude<SurfaceId, "projects" | "canvas">; label: string }[] = [
  { surfaceId: "timeline", label: "Open in Timeline" },
  { surfaceId: "places", label: "Open in Places" },
  { surfaceId: "story", label: "Open in Story" },
  { surfaceId: "palace", label: "Open in Palace" },
];

interface TreeRowProps {
  id: string;
  label: string;
  depth: number;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  selectedId: string | null;
  onClick: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
  testId: string;
  children?: React.ReactNode;
}

function TreeRow({
  id,
  label,
  depth,
  expandedIds,
  onToggle,
  selectedId,
  onClick,
  onContextMenu,
  testId,
  children,
}: TreeRowProps) {
  const expanded = expandedIds.has(id);
  const hasChildren = Boolean(children);
  const selected = selectedId === id;

  return (
    <li
      className="tree__item"
      role="treeitem"
      aria-level={depth}
      aria-selected={selected}
      aria-expanded={hasChildren ? expanded : undefined}
    >
      <div className="tree__row">
        {hasChildren && (
          <button
            type="button"
            className="tree__disclosure"
            data-testid={`tree-disclosure-${id}`}
            aria-label={expanded ? "Collapse" : "Expand"}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(id);
            }}
          >
            {expanded ? "▼" : "▶"}
          </button>
        )}
        <button
          type="button"
          className="tree__button"
          data-testid={testId}
          data-selected={selected ? "true" : undefined}
          onClick={() => {
            onClick();
          }}
          onContextMenu={onContextMenu}
        >
          <span className="tree__name">{label}</span>
        </button>
      </div>
      {expanded && hasChildren && (
        <ul className="tree tree--nested" role="group">
          {children}
        </ul>
      )}
    </li>
  );
}

interface ConstellationItemProps {
  constellation: ProjectTreeConstellation;
  depth: number;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  selectedId: string | null;
  onSelectNode: (id: string) => void;
  onOpenContextMenu: (constellation: ProjectTreeConstellation, event: React.MouseEvent) => void;
}

function ConstellationItem({
  constellation,
  depth,
  expandedIds,
  onToggle,
  selectedId,
  onSelectNode,
  onOpenContextMenu,
}: ConstellationItemProps) {
  const workspace = useCanvasWorkspace();
  const expanded = expandedIds.has(constellation.id);
  const hasNestedChildren = constellation.children.length > 0;
  const hasContentGroups =
    constellation.canvases.length > 0 ||
    constellation.sequences.length > 0 ||
    constellation.scenes.length > 0 ||
    Object.keys(constellation.nodes).length > 0;
  const hasChildren = hasNestedChildren || hasContentGroups;

  const handleSelect = useCallback(() => {
    onSelectNode(constellation.id);
    void workspace.openConstellationTab(constellation.id);
  }, [constellation.id, onSelectNode, workspace]);

  const handleContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      onOpenContextMenu(constellation, event);
    },
    [constellation, onOpenContextMenu],
  );

  return (
    <li
      className="tree__item"
      role="treeitem"
      aria-level={depth}
      aria-selected={selectedId === constellation.id}
      aria-expanded={hasChildren ? expanded : undefined}
    >
      <div className="tree__row">
        {hasChildren && (
          <button
            type="button"
            className="tree__disclosure"
            data-testid={`tree-disclosure-${constellation.id}`}
            aria-label={expanded ? "Collapse" : "Expand"}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(constellation.id);
            }}
          >
            {expanded ? "▼" : "▶"}
          </button>
        )}
        <button
          type="button"
          className="tree__button"
          data-testid={`constellation-node-${constellation.id}`}
          data-selected={selectedId === constellation.id ? "true" : undefined}
          onClick={handleSelect}
          onContextMenu={handleContextMenu}
          title="Right-click to open in another surface"
        >
          <span className="tree__name">{constellation.name}</span>
        </button>
      </div>
      {expanded && (
        <ul className="tree tree--nested" role="group">
          {constellation.children.map((child) => (
            <ConstellationItem
              key={child.id}
              constellation={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              onToggle={onToggle}
              selectedId={selectedId}
              onSelectNode={onSelectNode}
              onOpenContextMenu={onOpenContextMenu}
            />
          ))}
          {constellation.canvases.length > 0 && (
            <CanvasGroup
              parentId={constellation.id}
              depth={depth + 1}
              canvases={constellation.canvases}
              expandedIds={expandedIds}
              onToggle={onToggle}
              selectedId={selectedId}
              onSelectNode={onSelectNode}
            />
          )}
          {constellation.sequences.length > 0 && (
            <SequenceGroup
              parentId={constellation.id}
              depth={depth + 1}
              sequences={constellation.sequences}
              expandedIds={expandedIds}
              onToggle={onToggle}
              selectedId={selectedId}
              onSelectNode={onSelectNode}
            />
          )}
          {constellation.scenes.length > 0 && (
            <SceneGroup
              parentId={constellation.id}
              depth={depth + 1}
              scenes={constellation.scenes}
              expandedIds={expandedIds}
              onToggle={onToggle}
              selectedId={selectedId}
              onSelectNode={onSelectNode}
            />
          )}
          {Object.entries(constellation.nodes).map(([entityType, graphNodes]) => (
            <GraphNodeGroup
              key={`${constellation.id}-nodes-${entityType}`}
              parentId={constellation.id}
              depth={depth + 1}
              entityType={entityType}
              graphNodes={graphNodes}
              expandedIds={expandedIds}
              onToggle={onToggle}
              selectedId={selectedId}
              onSelectNode={onSelectNode}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

interface CanvasGroupProps {
  parentId: string;
  depth: number;
  canvases: ProjectTreeCanvas[];
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  selectedId: string | null;
  onSelectNode: (id: string) => void;
}

function CanvasGroup({
  parentId,
  depth,
  canvases,
  expandedIds,
  onToggle,
  selectedId,
  onSelectNode,
}: CanvasGroupProps) {
  const workspace = useCanvasWorkspace();
  const groupId = `${parentId}-canvases`;

  return (
    <TreeRow
      id={groupId}
      label="Canvases"
      depth={depth}
      expandedIds={expandedIds}
      onToggle={onToggle}
      selectedId={selectedId}
      onClick={() => onToggle(groupId)}
      testId={`tree-group-${groupId}`}
    >
      {canvases.map((canvas) => (
        <li
          key={canvas.id}
          className="tree__item"
          role="treeitem"
          aria-level={depth + 1}
          aria-selected={selectedId === canvas.id}
        >
          <button
            type="button"
            className="tree__button"
            data-testid={`canvas-node-${canvas.id}`}
            data-selected={selectedId === canvas.id ? "true" : undefined}
            onClick={() => {
              onSelectNode(canvas.id);
              void workspace.openCanvas(canvas.id);
            }}
          >
            <span className="tree__name">{canvas.name}</span>
          </button>
        </li>
      ))}
    </TreeRow>
  );
}

interface SequenceGroupProps {
  parentId: string;
  depth: number;
  sequences: ProjectTreeSequence[];
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  selectedId: string | null;
  onSelectNode: (id: string) => void;
}

function SequenceGroup({
  parentId,
  depth,
  sequences,
  expandedIds,
  onToggle,
  selectedId,
  onSelectNode,
}: SequenceGroupProps) {
  const workspace = useCanvasWorkspace();
  const groupId = `${parentId}-sequences`;

  return (
    <TreeRow
      id={groupId}
      label="Sequences"
      depth={depth}
      expandedIds={expandedIds}
      onToggle={onToggle}
      selectedId={selectedId}
      onClick={() => onToggle(groupId)}
      testId={`tree-group-${groupId}`}
    >
      {sequences.map((sequence) => (
        <li
          key={sequence.id}
          className="tree__item"
          role="treeitem"
          aria-level={depth + 1}
          aria-selected={selectedId === sequence.id}
        >
          <button
            type="button"
            className="tree__button"
            data-testid={`sequence-node-${sequence.id}`}
            data-selected={selectedId === sequence.id ? "true" : undefined}
            onClick={() => {
              onSelectNode(sequence.id);
              void workspace.openCanvas(sequence.canvasId);
            }}
          >
            <span className="tree__name">{sequence.name}</span>
          </button>
        </li>
      ))}
    </TreeRow>
  );
}

interface SceneGroupProps {
  parentId: string;
  depth: number;
  scenes: ProjectTreeScene[];
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  selectedId: string | null;
  onSelectNode: (id: string) => void;
}

function SceneGroup({
  parentId,
  depth,
  scenes,
  expandedIds,
  onToggle,
  selectedId,
  onSelectNode,
}: SceneGroupProps) {
  const workspace = useCanvasWorkspace();
  const groupId = `${parentId}-scenes`;

  const openScene = useCallback(
    (scene: ProjectTreeScene) => {
      onSelectNode(scene.id);
      const state: { surfaceId: "story" } = { surfaceId: "story" };
      workspace.openTab({
        id: crypto.randomUUID(),
        surfaceId: "story",
        title: scene.name,
        pinned: false,
        state,
      });
    },
    [onSelectNode, workspace],
  );

  return (
    <TreeRow
      id={groupId}
      label="Scenes"
      depth={depth}
      expandedIds={expandedIds}
      onToggle={onToggle}
      selectedId={selectedId}
      onClick={() => onToggle(groupId)}
      testId={`tree-group-${groupId}`}
    >
      {scenes.map((scene) => (
        <li
          key={scene.id}
          className="tree__item"
          role="treeitem"
          aria-level={depth + 1}
          aria-selected={selectedId === scene.id}
        >
          <button
            type="button"
            className="tree__button"
            data-testid={`scene-node-${scene.id}`}
            data-selected={selectedId === scene.id ? "true" : undefined}
            onClick={() => openScene(scene)}
          >
            <span className="tree__name">{scene.name}</span>
          </button>
        </li>
      ))}
    </TreeRow>
  );
}

interface GraphNodeGroupProps {
  parentId: string;
  depth: number;
  entityType: string;
  graphNodes: ProjectTreeGraphNode[];
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  selectedId: string | null;
  onSelectNode: (id: string) => void;
}

function GraphNodeGroup({
  parentId,
  depth,
  entityType,
  graphNodes,
  expandedIds,
  onToggle,
  selectedId,
  onSelectNode,
}: GraphNodeGroupProps) {
  const workspace = useCanvasWorkspace();
  const groupId = `${parentId}-nodes-${entityType}`;

  return (
    <TreeRow
      id={groupId}
      label={entityType}
      depth={depth}
      expandedIds={expandedIds}
      onToggle={onToggle}
      selectedId={selectedId}
      onClick={() => onToggle(groupId)}
      testId={`tree-group-${groupId}`}
    >
      {graphNodes.map((node) => (
        <li
          key={node.id}
          className="tree__item"
          role="treeitem"
          aria-level={depth + 1}
          aria-selected={selectedId === node.id}
        >
          <button
            type="button"
            className="tree__button"
            data-testid={`graph-node-${node.id}`}
            data-selected={selectedId === node.id ? "true" : undefined}
            onClick={() => {
              onSelectNode(node.id);
              workspace.selectNode(node.id);
            }}
          >
            <span className="tree__name">{node.name}</span>
          </button>
        </li>
      ))}
    </TreeRow>
  );
}

function collectDefaultExpanded(
  constellations: ProjectTreeConstellation[],
): Set<string> {
  const ids = new Set<string>();

  const walk = (constellation: ProjectTreeConstellation) => {
    if (constellation.children.length > 0) {
      ids.add(constellation.id);
    }
    if (constellation.canvases.length > 0) {
      ids.add(`${constellation.id}-canvases`);
    }
    if (constellation.sequences.length > 0) {
      ids.add(`${constellation.id}-sequences`);
    }
    if (constellation.scenes.length > 0) {
      ids.add(`${constellation.id}-scenes`);
    }
    for (const entityType of Object.keys(constellation.nodes)) {
      ids.add(`${constellation.id}-nodes-${entityType}`);
    }
    for (const child of constellation.children) {
      walk(child);
    }
  };

  for (const constellation of constellations) {
    walk(constellation);
  }

  return ids;
}

function surfaceTabState(surfaceId: Exclude<SurfaceId, "projects" | "canvas">): SurfaceTabState {
  switch (surfaceId) {
    case "timeline":
      return { surfaceId, centerYear: 0, pixelsPerYear: 20 };
    case "places":
      return { surfaceId, viewport: { x: 0, y: 0, zoom: 1 } };
    case "story":
      return { surfaceId };
    case "palace":
      return { surfaceId };
  }
}

export function ProjectTree() {
  const workspace = useCanvasWorkspace();
  const { tree, isLoading, error, selectedId, selectNode, refresh } = useProjectTree();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{
    constellation: ProjectTreeConstellation;
    x: number;
    y: number;
  } | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const defaultExpanded = useMemo(
    () => (tree ? collectDefaultExpanded(tree.constellations) : new Set<string>()),
    [tree],
  );
  const hasUserToggled = useRef(false);

  useEffect(() => {
    // Seed the default expanded state only until the user starts toggling.
    // Without this guard, async load settling recomputes defaultExpanded with
    // a fresh identity and clobbers the user's collapse/expand choices.
    if (hasUserToggled.current) return;
    setExpandedIds(defaultExpanded);
  }, [defaultExpanded]);

  const toggleExpanded = useCallback((id: string) => {
    hasUserToggled.current = true;
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleOpenProjectRoot = useCallback(async () => {
    setDialogError(null);
    try {
      if (!workspace.databasePath) {
        throw new Error("Workspace is not bootstrapped yet");
      }
      const home = await workspace.resolveOrCreateHome({
        databasePath: workspace.databasePath,
      });
      const selected = await open({ directory: true });
      if (selected === null || Array.isArray(selected)) {
        return;
      }
      const name = selected.split(/[/\\]/).pop() || "New project";
      const project = await workspace.createProject({
        databasePath: workspace.databasePath,
        homePath: home.homePath,
        name,
        rootType: "directory",
        sourcePath: selected,
      });
      await workspace.selectProject(project.id);
      await refresh();
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : String(err));
    }
  }, [refresh, workspace]);

  const handleOpenContextMenu = useCallback(
    (constellation: ProjectTreeConstellation, event: React.MouseEvent) => {
      setContextMenu({ constellation, x: event.clientX, y: event.clientY });
    },
    [],
  );

  const handleOpenConstellationSurface = useCallback(
    async (constellation: ProjectTreeConstellation, surfaceId: Exclude<SurfaceId, "projects" | "canvas">) => {
      setContextMenu(null);
      if (workspace.activeConstellationId !== constellation.id) {
        await workspace.openConstellationTab(constellation.id);
      }
      workspace.openTab({
        id: crypto.randomUUID(),
        surfaceId,
        title: constellation.name,
        pinned: false,
        state: surfaceTabState(surfaceId),
      });
    },
    [workspace],
  );

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler, { once: true });
    return () => window.removeEventListener("click", handler);
  }, [contextMenu]);

  if (!tree?.root) {
    return (
      <section className="tree-section" data-testid="left-mode-projects" aria-label="Project tree">
        <div className="lo-empty">No project selected</div>
      </section>
    );
  }

  return (
    <section className="tree-section" data-testid="left-mode-projects" aria-label="Project tree">
      <div className="tree-section__heading">
        <p className="eyebrow">Project</p>
        <h2>{tree.root.displayName}</h2>
      </div>

      <div className="project-tree__root">
        <button
          type="button"
          className="project-tree__root-picker"
          data-testid="project-root-picker"
          aria-label="Open project root"
          onClick={() => {
            void handleOpenProjectRoot();
          }}
        >
          <span>Open project root…</span>
        </button>
      </div>

      {dialogError && <div className="lo-folder-input__error" data-testid="project-root-error">{dialogError}</div>}
      {isLoading && <div className="lo-empty">Loading project tree…</div>}
      {error && <div className="lo-folder-input__error">{error}</div>}

      <ul className="tree" role="tree">
        {tree.constellations.map((constellation) => (
          <ConstellationItem
            key={constellation.id}
            constellation={constellation}
            depth={1}
            expandedIds={expandedIds}
            onToggle={toggleExpanded}
            selectedId={selectedId}
            onSelectNode={selectNode}
            onOpenContextMenu={handleOpenContextMenu}
          />
        ))}
      </ul>

      {contextMenu && (
        <div
          className="project-tree__context-menu"
          role="menu"
          data-testid="project-tree-context-menu"
          style={{ position: "fixed", left: contextMenu.x, top: contextMenu.y }}
        >
          {CONTEXT_MENU_SURFACES.map(({ surfaceId, label }) => (
            <button
              key={surfaceId}
              type="button"
              role="menuitem"
              className="project-tree__context-menu-item"
              data-testid={`open-constellation-${surfaceId}`}
              onClick={() => handleOpenConstellationSurface(contextMenu.constellation, surfaceId)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
