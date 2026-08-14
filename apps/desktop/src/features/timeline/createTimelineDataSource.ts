import type { TimelineDataSource } from "@research-canvas/canvas";
import type {
  ArchetypalLighting,
  DesktopTimelineRepository,
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

/**
 * Adapt the canonical desktop timeline repository to the narrow view-model
 * port used by the rich TimelineLens. The legacy input shape is retained for
 * callers that have not yet moved composition into the feature boundary, but
 * it is immediately wrapped as a repository-shaped adapter rather than being
 * read by the surface itself.
 */
export function createTimelineDataSource(input:
  | { repository: TimelineRuntimeRepository }
  | { transport: TimelineTransport; workspaceId: string },
): TimelineDataSource {
  const repository = "repository" in input
    ? input.repository
    : legacyRuntimeRepository(input.transport, input.workspaceId);

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
      return repository.resonancesForInstance(graphNodeId);
    },
    ...(repository.relationFieldForEvent
      ? {
          async relationFieldForEvent(graphNodeId: string) {
            return repository.relationFieldForEvent!(graphNodeId);
          },
        }
      : {}),
    ...(repository.expandNode
      ? {
          async expandNode(graphNodeId: string) {
            return repository.expandNode!(graphNodeId);
          },
        }
      : {}),
  };
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
