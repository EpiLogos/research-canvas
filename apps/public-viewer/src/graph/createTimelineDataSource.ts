import type { TimelineDataSource } from "@research-canvas/canvas";
import type {
  ArchetypalLighting,
  LitInstance,
  TimelineView,
  WorkspaceTransport,
} from "@research-canvas/desktop-api";

type TimelineTransport = Pick<
  WorkspaceTransport,
  "loadTimelineView" | "archetypalLighting" | "resonancesForInstance" | "expandTimelineNode"
>;

/**
 * Web-local mirror of apps/desktop/src/features/timeline/createTimelineDataSource.ts.
 *
 * Adapts a read-only WorkspaceTransport (createStaticBundleTransport) to the
 * narrow TimelineDataSource port the SHARED <TimelineLens> needs, so the web
 * timeline lens runs the exact same view code as the desktop — only the data
 * source differs (static bundle vs. live backend). loadTimelineNodes asks the
 * transport for the bundle's workspace-level timeline view.
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
    async archetypalLighting(operatorGraphNodeId: string): Promise<ArchetypalLighting> {
      return transport.archetypalLighting({ operatorGraphNodeId });
    },
    async resonancesForInstance(graphNodeId: string): Promise<LitInstance[]> {
      return transport.resonancesForInstance({ graphNodeId });
    },
    async expandNode(graphNodeId: string) {
      return transport.expandTimelineNode({ workspaceId, graphNodeId });
    },
  };
}
