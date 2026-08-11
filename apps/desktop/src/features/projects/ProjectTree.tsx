import { useCallback, useEffect, useMemo, useState } from "react";
import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";
import { useProjectTabs } from "./ProjectTabContext";
import { useProjectTree } from "./useProjectTree";
import type {
  ProjectTreeCanvas,
  ProjectTreeConstellation,
  ProjectTreeGraphNode,
  ProjectTreeScene,
  ProjectTreeSequence,
} from "./types";

interface TreeRowProps {
  id: string;
  label: string;
  depth: number;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  selectedId: string | null;
  onClick: () => void;
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
}

function ConstellationItem({
  constellation,
  depth,
  expandedIds,
  onToggle,
  selectedId,
  onSelectNode,
}: ConstellationItemProps) {
  const tabs = useProjectTabs();
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
    tabs.openConstellation(constellation.id);
  }, [constellation.id, onSelectNode, tabs]);

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
  const tabs = useProjectTabs();
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
              tabs.openCanvas(canvas.id);
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
  const tabs = useProjectTabs();
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
              tabs.openSequence(sequence.id);
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
  const tabs = useProjectTabs();
  const groupId = `${parentId}-scenes`;

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
            onClick={() => {
              onSelectNode(scene.id);
              tabs.openScene(scene.id);
            }}
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
  const tabs = useProjectTabs();
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
              tabs.selectNode(node.id);
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

export function ProjectTree() {
  const workspace = useCanvasWorkspace();
  const { tree, isLoading, error, selectedId, selectNode } = useProjectTree();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const rootProjects = useMemo(
    () => workspace.constellations.filter((constellation) => constellation.parentId === null),
    [workspace.constellations],
  );

  const defaultExpanded = useMemo(
    () => (tree ? collectDefaultExpanded(tree.constellations) : new Set<string>()),
    [tree],
  );

  useEffect(() => {
    setExpandedIds(defaultExpanded);
  }, [defaultExpanded]);

  const toggleExpanded = useCallback((id: string) => {
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

  if (!tree) {
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
          aria-expanded={pickerOpen}
          aria-label="Project root picker"
          onClick={() => setPickerOpen((open) => !open)}
        >
          <span>{tree.root.displayName}</span>
          <span aria-hidden="true">{pickerOpen ? "▲" : "▼"}</span>
        </button>
        {pickerOpen && (
          <ul className="project-tree__root-menu" role="menu">
            {rootProjects.map((project) => (
              <li key={project.id} role="none">
                <button
                  type="button"
                  className="project-tree__root-option"
                  role="menuitem"
                  data-testid={`project-node-${project.id}`}
                  data-active={project.id === workspace.activeProjectId ? "true" : undefined}
                  onClick={() => {
                    setPickerOpen(false);
                    void workspace.selectProject(project.id);
                  }}
                >
                  {project.name}
                </button>
              </li>
            ))}
            {rootProjects.length === 0 && (
              <li className="lo-empty" role="none">
                No projects available
              </li>
            )}
          </ul>
        )}
      </div>

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
          />
        ))}
      </ul>
    </section>
  );
}
