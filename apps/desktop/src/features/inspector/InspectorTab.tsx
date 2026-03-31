import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";

const DOT_PRESETS = ["#4a4aff","#9b59b6","#27ae60","#e67e22","#e74c3c","#1abc9c","#f39c12","#888888"];

export function InspectorTab() {
  const workspace = useCanvasWorkspace();
  const node = workspace.nodes.find((n) => n.id === workspace.selectedNodeId) ?? null;

  if (!node) {
    return (
      <div className="inspector-empty">
        <p>Select a node to inspect it</p>
      </div>
    );
  }

  return (
    <div className="inspector-tab">
      <div className="inspector-field">
        <label className="inspector-label">Title</label>
        <div className="inspector-value">{node.title}</div>
      </div>
      <div className="inspector-field">
        <label className="inspector-label">Type</label>
        <div className="inspector-value inspector-value--type">{node.type}</div>
      </div>
      <div className="inspector-section-title">Appearance</div>
      <div className="inspector-colours" data-placeholder="wired-task-14" />
    </div>
  );
}
