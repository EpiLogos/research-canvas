import type { JSX } from "react";

import type { GraphNode, TimelineRelationField as TimelineRelationFieldData } from "./contracts";

export function TimelineRelationField({
  field,
  onOpenNode,
}: {
  field: TimelineRelationFieldData;
  onOpenNode: (graphNodeId: string, node: GraphNode) => void;
}): JSX.Element {
  const contextualById = new Map(field.contextualNodes.map((node) => [node.graphNodeId, node]));
  const rows = field.relationships.flatMap((relationship) => {
    const otherId = relationship.sourceGraphNodeId === field.subjectGraphNodeId
      ? relationship.targetGraphNodeId
      : relationship.targetGraphNodeId === field.subjectGraphNodeId
        ? relationship.sourceGraphNodeId
        : null;
    if (!otherId) return [];
    return [{ relationship, node: contextualById.get(otherId) ?? null }];
  });

  return (
    <aside className="timeline-relation-field" data-testid="timeline-relation-field" aria-label="Focused relations">
      <strong>Relation field</strong>
      {rows.length === 0 ? (
        <p>No related entities</p>
      ) : (
        <ul>
          {rows.map(({ relationship, node }) => (
            <li key={relationship.id} data-testid={`timeline-relation-${relationship.id}`}>
              <span>{relationship.relType.replaceAll("_", " ")}</span>
              {node ? (
                <button type="button" onClick={() => onOpenNode(node.graphNodeId, node)}>
                  {node.title}
                </button>
              ) : (
                <span>{relationship.sourceGraphNodeId === field.subjectGraphNodeId
                  ? relationship.targetGraphNodeId
                  : relationship.sourceGraphNodeId}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
