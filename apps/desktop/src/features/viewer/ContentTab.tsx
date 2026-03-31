import { useCanvasWorkspace } from "../canvas/CanvasWorkspaceContext";

interface ContentTabProps {
  onFullScreen: () => void;
}

export function ContentTab({ onFullScreen }: ContentTabProps) {
  const workspace = useCanvasWorkspace();
  const node = workspace.nodes.find((n) => n.id === workspace.selectedNodeId) ?? null;

  if (!node) {
    return <div className="content-tab-empty">No node selected</div>;
  }

  return (
    <div className="content-tab">
      <div className="content-tab__toolbar">
        <span className="content-tab__title">{node.title}</span>
        <button
          className="content-tab__fullscreen-btn"
          onClick={onFullScreen}
          title="Full screen"
        >
          ⤢
        </button>
      </div>
      <div className="content-tab__body">
        {node.type === "note" ? (
          <textarea
            className="content-tab__note-editor"
            defaultValue={node.content ?? ""}
            placeholder="Write a note…"
          />
        ) : (
          <div className="content-tab__placeholder">
            {"absolutePath" in node ? node.absolutePath : "No content attached"}
          </div>
        )}
      </div>
    </div>
  );
}
