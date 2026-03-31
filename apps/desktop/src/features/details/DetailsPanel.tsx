import type { CanvasEdge, CanvasNode } from "@research-canvas/schema";

import { NodeDetailBody } from "./NodeDetailBody";

interface DetailsPanelProps {
  edges: CanvasEdge[];
  nodes: CanvasNode[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onOpenFocusedView: (nodeId: string) => void;
}

export function DetailsPanel({
  edges,
  nodes,
  onOpenFocusedView,
  onSelectNode,
  selectedNodeId
}: DetailsPanelProps) {
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) ?? null;

  return (
    <section className="details-panel">
      <section className="details-panel__section">
        <div className="panel-header">
          <p className="eyebrow">Inspector</p>
          <h2>{selectedNode ? selectedNode.title : "Node details"}</h2>
        </div>

        <div className="details-panel__node-list" aria-label="Canvas nodes">
          {nodes.length === 0 ? (
            <p>No nodes yet.</p>
          ) : (
            nodes.map((node) => (
              <button
                aria-label={node.title}
                aria-pressed={node.id === selectedNodeId}
                className="details-panel__node-button"
                key={node.id}
                type="button"
                onClick={() => onSelectNode(node.id)}
              >
                <strong>{node.title}</strong>
                <span>{node.type}</span>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="details-panel__section">
        {selectedNode ? (
          <>
            <NodeDetailBody node={selectedNode} />

            <button
              className="details-panel__open-button"
              type="button"
              onClick={() => onOpenFocusedView(selectedNode.id)}
            >
              Open focused view
            </button>
          </>
        ) : (
          <p className="details-panel__empty">Select a node.</p>
        )}
      </section>

      {selectedNode ? (
        <section className="details-panel__section">
          <header className="panel-header">
            <p className="eyebrow">Relations</p>
            <h2>Connected nodes</h2>
          </header>
          <div className="details-panel__relations">
            {relatedNodes(selectedNode, nodes, edges).length === 0 ? (
              <p>No graph relations yet.</p>
            ) : (
              relatedNodes(selectedNode, nodes, edges).map((item) => (
                <button
                  aria-label={item.node.title}
                  className="details-panel__relation"
                  key={`${item.edge.id}-${item.node.id}`}
                  type="button"
                  onClick={() => onSelectNode(item.node.id)}
                >
                  <strong>{item.node.title}</strong>
                  <span>{item.edge.relationKind}</span>
                </button>
              ))
            )}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function relatedNodes(
  selectedNode: CanvasNode,
  nodes: CanvasNode[],
  edges: CanvasEdge[]
) {
  return edges
    .filter(
      (edge) =>
        edge.sourceNodeId === selectedNode.id || edge.targetNodeId === selectedNode.id
    )
    .map((edge) => {
      const otherNodeId =
        edge.sourceNodeId === selectedNode.id ? edge.targetNodeId : edge.sourceNodeId;
      return {
        edge,
        node: nodes.find((candidate) => candidate.id === otherNodeId)
      };
    })
    .filter((item): item is { edge: CanvasEdge; node: CanvasNode } =>
      Boolean(item.node)
    );
}
