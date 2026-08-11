import type { TimelineDataSource } from "@research-canvas/canvas";
import type {
  ArchetypalLighting,
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

/**
 * Adapt the WS0 §5.2 WorkspaceServices to the narrow TimelineDataSource port
 * the TimelineLens needs. Timeline membership is workspace-scoped temporal
 * graph metadata and never derives from an active constellation canvas.
 */
export function createTimelineDataSource(input: {
  transport: TimelineTransport;
  workspaceId: string;
}): TimelineDataSource {
  const { transport, workspaceId } = input;
  return {
    async loadTimelineView(range?: TimelineYearRange, filters?: TimelineFilters): Promise<TimelineView> {
      return transport.loadTimelineView({
        workspaceId,
        ...(range ? { range } : {}),
        ...(filters ? { filters } : {}),
      });
    },
    ...(transport.readGraphNode
      ? { async loadNode(graphNodeId: string) { return transport.readGraphNode!({ graphNodeId }); } }
      : {}),
    async saveTimelineLayout(layout) {
      return transport.upsertTimelineLayout({ ...layout, workspaceId });
    },
    async archetypalLighting(operatorGraphNodeId: string): Promise<ArchetypalLighting> {
      return transport.archetypalLighting({ operatorGraphNodeId });
    },
    async resonancesForInstance(graphNodeId: string): Promise<LitInstance[]> {
      return transport.resonancesForInstance({ graphNodeId });
    },
    ...(transport.loadTimelineRelationField
      ? {
          async relationFieldForEvent(graphNodeId: string) {
            return transport.loadTimelineRelationField!({ workspaceId, graphNodeId });
          },
        }
      : {}),
    ...(transport.expandTimelineNode
      ? {
          async expandNode(graphNodeId: string) {
            return transport.expandTimelineNode!({ workspaceId, graphNodeId });
          },
        }
      : {}),
  };
}
