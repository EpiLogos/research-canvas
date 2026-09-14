import type { TimelineDataSource } from "@research-canvas/canvas";
import type {
  ArchetypalLighting,
  DesktopTimelineRepository,
  ExpandedTimelineNode,
  LitInstance,
  TimelineFilters,
  TimelineView,
  TimelineYearRange,
  WorkspaceServices,
} from "@research-canvas/desktop-api";

type TimelineTransport = Pick<
  WorkspaceServices,
  "loadTimelineView" | "loadTimelineRelationField" | "upsertTimelineLayout" | "archetypalLighting" | "resonancesForInstance"
> & Partial<Pick<WorkspaceServices, "readGraphNode" | "expandTimelineNode">>;

type TimelineRuntimeRepository = Pick<
  DesktopTimelineRepository,
  "loadTimelineView" | "archetypalLighting" | "resonancesForInstance" | "saveTimelineLayout"
> & Partial<Pick<
  DesktopTimelineRepository,
  "loadNode" | "relationFieldForEvent" | "expandNode"
>>;

const RESONANCE_RELATION_TYPES = new Set<LitInstance["relType"]>([
  "INSTANTIATES",
  "ECHOES",
  "RESONATES_WITH",
]);
const RESONANCE_OPERATOR_TYPES = new Set(["Archetype", "Dynamic", "PsychoidOperator"]);

/**
 * Adapt the canonical desktop timeline repository to the narrow view-model
 * port used by the rich TimelineLens. The legacy input shape is retained for
 * callers that have not yet moved composition into the feature boundary, but
 * it is immediately wrapped as a repository-shaped adapter rather than being
 * read by the surface itself.
 *
 * The desktop expansion boundary is local-first and already returns the exact
 * one-hop relationship neighbourhood needed by both the working set and
 * instance resonance. Reuse that boundary when available rather than issuing
 * a second Neo4j-only resonance request. Concurrent consumers of one click
 * share the same in-flight expansion without turning the cache into durable
 * graph state.
 */
export function createTimelineDataSource(input:
  | { repository: TimelineRuntimeRepository }
  | { transport: TimelineTransport; workspaceId: string },
): TimelineDataSource {
  const repository = "repository" in input
    ? input.repository
    : legacyRuntimeRepository(input.transport, input.workspaceId);
  const expansionRequests = new Map<string, Promise<ExpandedTimelineNode>>();
  const loadExpansion = repository.expandNode
    ? (graphNodeId: string): Promise<ExpandedTimelineNode> => {
        const current = expansionRequests.get(graphNodeId);
        if (current) return current;
        const request = repository.expandNode!(graphNodeId).finally(() => {
          if (expansionRequests.get(graphNodeId) === request) {
            expansionRequests.delete(graphNodeId);
          }
        });
        expansionRequests.set(graphNodeId, request);
        return request;
      }
    : null;

  return {
    async loadTimelineView(range?: TimelineYearRange, filters?: TimelineFilters): Promise<TimelineView> {
      return repository.loadTimelineView(range, filters);
    },
    ...(repository.loadNode
      ? { async loadNode(graphNodeId: string) { return repository.loadNode!(graphNodeId); } }
      : {}),
    async saveTimelineLayout(layout) {
      return repository.saveTimelineLayout(layout);
    },
    async archetypalLighting(operatorGraphNodeId: string): Promise<ArchetypalLighting> {
      return repository.archetypalLighting(operatorGraphNodeId);
    },
    async resonancesForInstance(graphNodeId: string): Promise<LitInstance[]> {
      if (loadExpansion) {
        return resonancesFromExpansion(await loadExpansion(graphNodeId));
      }
      return repository.resonancesForInstance(graphNodeId);
    },
    ...(repository.relationFieldForEvent
      ? {
          async relationFieldForEvent(graphNodeId: string) {
            return repository.relationFieldForEvent!(graphNodeId);
          },
        }
      : {}),
    ...(loadExpansion
      ? {
          async expandNode(graphNodeId: string) {
            return loadExpansion(graphNodeId);
          },
        }
      : {}),
  };
}

function resonancesFromExpansion(expansion: ExpandedTimelineNode): LitInstance[] {
  const neighbours = new Map(
    expansion.neighbours.map((node) => [node.graphNodeId, node] as const),
  );
  return expansion.edges.flatMap<LitInstance>((relationship) => {
    if (relationship.sourceGraphNodeId !== expansion.subjectGraphNodeId) return [];
    if (!RESONANCE_RELATION_TYPES.has(relationship.relType as LitInstance["relType"])) return [];
    const operator = neighbours.get(relationship.targetGraphNodeId);
    if (!operator || !RESONANCE_OPERATOR_TYPES.has(operator.entityType)) return [];
    const rawDominance = relationship.properties.dominance;
    const dominance: LitInstance["dominance"] =
      rawDominance === "dominant" || rawDominance === "secondary"
        ? rawDominance
        : null;
    return [{
      node: operator,
      relType: relationship.relType as LitInstance["relType"],
      dominance,
    }];
  });
}

function legacyRuntimeRepository(
  transport: TimelineTransport,
  workspaceId: string,
): TimelineRuntimeRepository {
  return {
    loadTimelineView: (range, filters) => transport.loadTimelineView({
      workspaceId,
      ...(range ? { range } : {}),
      ...(filters ? { filters } : {}),
    }),
    ...(transport.readGraphNode
      ? { loadNode: (graphNodeId: string) => transport.readGraphNode!({ graphNodeId }) }
      : {}),
    saveTimelineLayout: (layout) => transport.upsertTimelineLayout({ ...layout, workspaceId }),
    archetypalLighting: (operatorGraphNodeId) => transport.archetypalLighting({ operatorGraphNodeId }),
    resonancesForInstance: (graphNodeId) => transport.resonancesForInstance({ graphNodeId }),
    ...(transport.loadTimelineRelationField
      ? {
          relationFieldForEvent: (graphNodeId: string) => transport.loadTimelineRelationField!({
            workspaceId,
            graphNodeId,
          }),
        }
      : {}),
    ...(transport.expandTimelineNode
      ? {
          expandNode: (graphNodeId: string) => transport.expandTimelineNode!({ workspaceId, graphNodeId }),
        }
      : {}),
  };
}
