import type { JSX } from "react";

import type {
  GraphNode,
  LitInstance,
  TimelineRelationField as TimelineRelationFieldData,
} from "./contracts";
import { dominantResonance } from "./lighting";

interface RelationRow {
  relationship: TimelineRelationFieldData["relationships"][number];
  otherId: string;
  node: GraphNode | null;
  resonance: LitInstance | null;
  duplicateCount: number;
}

function isArchetypalContext(node: GraphNode | null): boolean {
  return node?.entityType === "Myth"
    || node?.entityType === "Archetype"
    || node?.entityType === "Dynamic"
    || node?.entityType === "PsychoidOperator";
}

function resonanceScore(instance: LitInstance): number {
  return (instance.relType === "INSTANTIATES" ? 2 : 0)
    + (instance.dominance === "dominant" ? 1 : 0);
}

function preferResonance(current: LitInstance | undefined, candidate: LitInstance): LitInstance {
  if (!current || resonanceScore(candidate) > resonanceScore(current)) return candidate;
  return current;
}

export function TimelineRelationField({
  field,
  resonances,
  showRelations,
  showArchetypalContext,
  onOpenNode,
  onLightOperator,
}: {
  field: TimelineRelationFieldData;
  resonances: LitInstance[];
  showRelations: boolean;
  showArchetypalContext: boolean;
  onOpenNode: (graphNodeId: string, node: GraphNode) => void;
  onLightOperator: (operatorGraphNodeId: string) => void;
}): JSX.Element {
  const contextualById = new Map(field.contextualNodes.map((node) => [node.graphNodeId, node]));
  const resonanceByKey = new Map<string, LitInstance>();
  for (const resonance of resonances) {
    const key = `${resonance.node.graphNodeId}:${resonance.relType}`;
    resonanceByKey.set(key, preferResonance(resonanceByKey.get(key), resonance));
  }

  // Collapse exact endpoint/type duplicates into one row. The full relation
  // set remains in the transport; the field is a readable projection of it.
  const rowsByKey = new Map<string, RelationRow>();
  for (const relationship of field.relationships) {
    const otherId = relationship.sourceGraphNodeId === field.subjectGraphNodeId
      ? relationship.targetGraphNodeId
      : relationship.targetGraphNodeId === field.subjectGraphNodeId
        ? relationship.sourceGraphNodeId
        : null;
    if (!otherId) continue;
    const key = `${otherId}:${relationship.relType}`;
    const node = contextualById.get(otherId) ?? null;
    const existing = rowsByKey.get(key);
    if (existing) {
      existing.duplicateCount += 1;
      continue;
    }
    rowsByKey.set(key, {
      relationship,
      otherId,
      node,
      resonance: resonanceByKey.get(key) ?? null,
      duplicateCount: 1,
    });
  }

  const relationRows = [...rowsByKey.values()].filter((row) => {
    if (!showRelations) return false;
    return showArchetypalContext || !isArchetypalContext(row.node);
  });
  // A resonance is folded into its canonical relation only while that
  // relation is visible. Hiding Links must not also hide the archetypal data.
  const representedResonances = new Set(
    relationRows.map((row) => `${row.otherId}:${row.relationship.relType}`),
  );
  const resonanceRows = showArchetypalContext
    ? [...resonanceByKey.entries()]
      .filter(([key]) => !representedResonances.has(key))
      .map(([, resonance]) => resonance)
    : [];
  const strongest = dominantResonance(resonances);

  const renderNode = (node: GraphNode | null, fallbackId: string) => node ? (
    <button type="button" onClick={() => onOpenNode(node.graphNodeId, node)}>
      {node.title}
    </button>
  ) : <span>{fallbackId}</span>;

  return (
    <aside className="timeline-relation-field" data-testid="timeline-relation-field" aria-label="Focused relations">
      <strong>Relation field</strong>
      {relationRows.length === 0 && resonanceRows.length === 0 ? (
        <p>No related entities in the current view</p>
      ) : (
        <>
          {relationRows.length > 0 && (
            <section className="timeline-relation-field__section" aria-labelledby="timeline-relations-heading">
              <h3 id="timeline-relations-heading">Relations</h3>
              <ul>
                {relationRows.map(({ relationship, otherId, node, resonance, duplicateCount }) => {
                  const isDominant = resonance !== null
                    && strongest?.node.graphNodeId === resonance.node.graphNodeId;
                  return (
                    <li key={relationship.id} data-testid={`timeline-relation-${relationship.id}`}>
                      <span className="timeline-relation-field__meta">
                        {relationship.relType.replaceAll("_", " ")}
                        {duplicateCount > 1 && <small> ×{duplicateCount}</small>}
                      </span>
                      <div className="timeline-relation-field__target">
                        {renderNode(node, otherId)}
                        {resonance && (
                          <button
                            type="button"
                            className="timeline-relation-field__action"
                            data-testid={`timeline-light-${resonance.node.graphNodeId}`}
                            data-dominant={isDominant ? "true" : undefined}
                            onClick={() => onLightOperator(resonance.node.graphNodeId)}
                          >
                            Light
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
          {resonanceRows.length > 0 && (
            <section className="timeline-relation-field__section" aria-labelledby="timeline-resonances-heading">
              <h3 id="timeline-resonances-heading">Resonant archetypes</h3>
              <ul>
                {resonanceRows.map((resonance) => {
                  const isDominant = strongest?.node.graphNodeId === resonance.node.graphNodeId;
                  return (
                    <li
                      key={`${resonance.node.graphNodeId}:${resonance.relType}`}
                      data-testid={`timeline-resonance-${resonance.node.graphNodeId}`}
                      data-dominant={isDominant ? "true" : undefined}
                    >
                      <span className="timeline-relation-field__meta">
                        {resonance.relType.replaceAll("_", " ")}
                      </span>
                      <div className="timeline-relation-field__target">
                        {renderNode(resonance.node, resonance.node.graphNodeId)}
                        <button
                          type="button"
                          className="timeline-relation-field__action"
                          data-testid={`timeline-light-${resonance.node.graphNodeId}`}
                          data-dominant={isDominant ? "true" : undefined}
                          onClick={() => onLightOperator(resonance.node.graphNodeId)}
                        >
                          Light
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </aside>
  );
}
