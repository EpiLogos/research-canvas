import {
  buildProjectTree,
  type ProjectTreeNode
} from "@research-canvas/desktop-api";

interface ProjectTreeProps {
  projects: ProjectTreeNode[];
  selectedProjectId: string;
  onSelectProject: (project: ProjectTreeNode) => void;
}

export function ProjectTree({
  projects,
  selectedProjectId,
  onSelectProject
}: ProjectTreeProps) {
  const tree = flattenProjects(buildProjectTree(projects));

  return (
    <section className="tree-section" aria-label="Constellation tree">
      <div className="tree-section__heading">
        <p className="eyebrow">Constellations</p>
        <h2>Timeline maps</h2>
      </div>
      <ul className="tree tree--projects" role="tree">
        {tree.map((project) => (
          <TreeItem
            key={project.id}
            project={project}
            selectedProjectId={selectedProjectId}
            onSelectProject={onSelectProject}
          />
        ))}
      </ul>
    </section>
  );
}

interface TreeItemProps {
  project: ProjectTreeNode;
  selectedProjectId: string;
  onSelectProject: (project: ProjectTreeNode) => void;
}

function TreeItem({
  project,
  selectedProjectId,
  onSelectProject
}: TreeItemProps) {
  const selected = project.id === selectedProjectId;

  return (
    <li className="tree__item" role="treeitem" aria-level={1} aria-selected={selected}>
      <button
        className="tree__button"
        aria-label={`${project.name} ${project.summary}`}
        data-selected={selected ? "true" : undefined}
        type="button"
        onClick={() => onSelectProject(project)}
      >
        <span className="tree__name">{project.name}</span>
        <span className="tree__summary">{project.summary}</span>
      </button>
    </li>
  );
}

function flattenProjects(projects: ProjectTreeNode[]) {
  const flattened: ProjectTreeNode[] = [];

  const visit = (project: ProjectTreeNode) => {
    flattened.push(project);
    for (const child of project.children) {
      visit(child);
    }
  };

  for (const project of projects) {
    visit(project);
  }

  return flattened;
}
