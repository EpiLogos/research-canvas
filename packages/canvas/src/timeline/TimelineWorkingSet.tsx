import type { JSX } from "react";

import type { ExpandedTimelineNode, GraphNode, GraphRelationship } from "./contracts";
import type { WorkingSetEntry } from "./timelineStore";

/**
 * Working-set stack (ticket #28, D13 §4.4): clicked nodes accumulate with their
 * real edges and neighbours; deep edge properties surface (provenance,
 * precision, role, mode, temporal bounds). Unloading removes from the stack —
 * the full graph never floods the timeline.
 */

const DEEP_PROPERTY_LABELS: Record<string, string> = {
  dominance: "role",
  role: "role",
  mode: "mode",
  temporal_precision: "precision",
  temporalPrecision: "precision",
  valid_from: "from",
  validFrom: "from",
  valid_to: "to",
  validTo: "to",
  source_coordinates: "provenance",
  sourceCoordinates: "provenance",
  evidence_tags: "evidence",
  evidenceTags: "evidence",
  seed_key: "key",
  seedKey: "key",
  canonical_key: "key",
  canonicalKey: "key",
  rel_precision: "precision",
  claim_kind: "role",
  claimKind: "role",
  historicity: "role",
};

const DEEP_PROPERTY_PRIORITY = [
  "mode",
  "dominance",
  "role",
  "temporal_precision",
  "temporalPrecision",
  "valid_from",
  "validFrom",
  "valid_to",
  "validTo",
  "source_coordinates",
  "sourceCoordinates",
  "evidence_tags",
  "evidenceTags",
  "seed_key",
  "seedKey",
  "canonical_key",
  "canonicalKey",
  "claim_kind",
  "claimKind",
  "historicity",
];

function deepPropertyRows(edge: GraphRelationship): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  const seen = new Set<string>();
  for (const key of DEEP_PROPERTY_PRIORITY) {
    if (seen.has(DEEP_PROPERTY_LABELS[key])) continue;
    if (edge.properties[key] === undefined) continue;
    seen.add(DEEP_PROPERTY_LABELS[key]);
    const value = edge.properties[key];
    rows.push({
      label: DEEP_PROPERTY_LABELS[key],
      value: Array.isArray(value) ? value.join(", ") : String(value),
    });
  }
  return rows;
}

function edgeKind(relType: string): string {
  return relType.replaceAll("_", " ").toLowerCase();
}

export function TimelineWorkingSet({
  workingSet,
  onUnload,
  onClear,
  onOpenNode,
}: {
  workingSet: WorkingSetEntry[];
  onUnload: (graphNodeId: string) => void;
  onClear: () => void;
  onOpenNode: (graphNodeId: string, node: GraphNode) => void;
}): JSX.Element {
  if (workingSet.length === 0) return <></>;

  return (
    <aside className="timeline-working-set" data-testid="timeline-working-set" aria-label="Timeline working set">
      <header className="timeline-working-set__header">
        <strong>Working set</strong>
        <button
          type="button"
          data-testid="timeline-working-set-clear"
          onClick={onClear}
        >
          Clear
        </button>
      </header>
      <ol className="timeline-working-set__stack">
        {workingSet.map((entry, index) => (
          <li
            key={entry.graphNodeId}
            data-testid={`timeline-working-set-entry-${entry.graphNodeId}`}
            data-stack-position={index}
            data-edge-count={entry.edges.length}
            data-neighbour-count={entry.neighbours.length}
          >
            <div className="timeline-working-set__subject">
              <button type="button" onClick={() => onOpenNode(entry.graphNodeId, entry.node)}>
                {entry.node.title}
              </button>
              <button
                type="button"
                className="timeline-working-set__unload"
                data-testid={`timeline-working-set-unload-${entry.graphNodeId}`}
                onClick={() => onUnload(entry.graphNodeId)}
              >
                Unload
              </button>
            </div>
            {entry.edges.length === 0 ? (
              <p className="timeline-working-set__empty">No edges loaded for this node</p>
            ) : (
              <ul className="timeline-working-set__edges">
                {entry.edges.map((edge) => {
                  const otherId =
                    edge.sourceGraphNodeId === entry.graphNodeId
                      ? edge.targetGraphNodeId
                      : edge.sourceGraphNodeId;
                  const other = entry.neighbours.find(
                    (neighbour) => neighbour.graphNodeId === otherId,
                  );
                  const rows = deepPropertyRows(edge);
                  return (
                    <li
                      key={edge.id}
                      data-testid={`timeline-working-set-edge-${edge.id}`}
                      data-relation-kind={edge.relType}
                    >
                      <span className="timeline-working-set__edge-kind">
                        {edgeKind(edge.relType)}
                      </span>
                      <span className="timeline-working-set__edge-target">
                        {other ? (
                          <button type="button" onClick={() => onOpenNode(other.graphNodeId, other)}>
                            {other.title}
                          </button>
                        ) : (
                          otherId
                        )}
                      </span>
                      {rows.length > 0 && (
                        <dl className="timeline-working-set__deep">
                          {rows.map((row) => (
                            <div key={row.label} data-testid={`timeline-working-set-deep-${edge.id}-${row.label}`}>
                              <dt>{row.label}</dt>
                              <dd>{row.value}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
        ))}
      </ol>
    </aside>
  );
}

/** Adapt an ExpandedTimelineNode transport result into a store WorkingSetEntry. */
export function toWorkingSetEntry(expansion: ExpandedTimelineNode): WorkingSetEntry {
  return {
    graphNodeId: expansion.subjectGraphNodeId,
    node: expansion.subject,
    edges: expansion.edges,
    neighbours: expansion.neighbours,
    loadedAt: Date.now(),
  };
}
