import type { TimelineDataSource } from "@research-canvas/canvas";
import type {
  ArchetypalLighting,
  LitInstance,
  TimelineView,
  WorkspaceTransport,
} from "@research-canvas/desktop-api";

type TimelineTransport = Pick<
  WorkspaceTransport,
  "loadTimelineView" | "loadTimelineRelationField" | "upsertTimelineLayout" | "archetypalLighting" | "resonancesForInstance"
>;

/**
 * Adapt the WS0 §5.2 WorkspaceTransport to the narrow TimelineDataSource port
 * the TimelineLens needs. Timeline membership is workspace-scoped temporal
 * graph metadata and never derives from an active constellation canvas.
 */
export function createTimelineDataSource(input: {
  transport: TimelineTransport;
  workspaceId: string;
}): TimelineDataSource {
  const { transport, workspaceId } = input;
  return {
    async loadTimelineView(): Promise<TimelineView> {
      return transport.loadTimelineView({ workspaceId });
    },
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
  };
}
