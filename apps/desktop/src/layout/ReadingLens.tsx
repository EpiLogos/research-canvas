import type { CanvasNode } from "@research-canvas/schema";
import { useCanvasWorkspace } from "../features/canvas/CanvasWorkspaceContext";
import { NodeReaderBody } from "../features/viewer/NodeReaderBody";

export function ReadingLens({ onFullScreen }: { onFullScreen: () => void }) {
  const workspace = useCanvasWorkspace();
  const node = (workspace.nodes as CanvasNode[]).find((n) => n.id === workspace.selectedNodeId) ?? null;

  return (
    <section className="ishell-reading" data-testid="reading-pane">
      {node ? (
        <>
          <div className="ishell-reading__bar">
            <span className="ishell-reading__title">{node.title}</span>
            <button
              type="button"
              className="ishell-reading__full"
              aria-label="Read full screen"
              onClick={onFullScreen}
            >
              ⤢
            </button>
          </div>
          <div className="ishell-reading__col">
            <NodeReaderBody node={node} />
          </div>
        </>
      ) : (
        <div className="ishell-reading__empty">Select a node to read</div>
      )}
    </section>
  );
}
