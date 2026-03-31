interface StatusBarWorkspace {
  activeProject?: { name: string } | null;
  nodes?: { id: string }[];
  edges?: { id: string }[];
}

interface StatusBarProps {
  workspace: StatusBarWorkspace;
}

export function StatusBar({ workspace }: StatusBarProps) {
  const projectName = workspace.activeProject?.name ?? "No project";
  const nodeCount = workspace.nodes?.length ?? 0;
  const edgeCount = workspace.edges?.length ?? 0;

  return (
    <footer className="status-bar">
      <span className="status-bar__left">{projectName}</span>
      <span className="status-bar__centre">
        {nodeCount} nodes · {edgeCount} edges
      </span>
      <span className="status-bar__right">
        <kbd>⌘T</kbd> terminal · <kbd>⌘K</kbd> search
      </span>
    </footer>
  );
}
