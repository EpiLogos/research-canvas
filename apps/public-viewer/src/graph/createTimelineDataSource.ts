import type { TimelineDataSource } from "@research-canvas/canvas";
import type {
  ArchetypalLighting,
  GraphNode,
  LitInstance,
  WorkspaceTransport,
} from "@research-canvas/desktop-api";

type TimelineTransport = Pick<
  WorkspaceTransport,
  "loadCanvasView" | "archetypalLighting" | "resonancesForInstance"
>;

/**
 * Web-local mirror of apps/desktop/src/features/timeline/createTimelineDataSource.ts.
 *
 * Adapts a read-only WorkspaceTransport (createStaticBundleTransport) to the
 * narrow TimelineDataSource port the SHARED <TimelineLens> needs, so the web
 * timeline lens runs the exact same view code as the desktop — only the data
 * source differs (static bundle vs. live backend). loadTimelineNodes asks the
 * transport for the server-filtered "timeline" lens (isTemporal === true) and
 * returns the GraphNode substance from each JoinedCanvasNode.
 */
export function createTimelineDataSource(input: {
  transport: TimelineTransport;
  canvasId: string;
}): TimelineDataSource {
  const { transport, canvasId } = input;
  return {
    async loadTimelineNodes(): Promise<GraphNode[]> {
      const view = await transport.loadCanvasView({ canvasId, lens: "timeline" });
      return view.nodes.map((joined) => joined.node);
    },
    async archetypalLighting(operatorGraphNodeId: string): Promise<ArchetypalLighting> {
      return transport.archetypalLighting({ operatorGraphNodeId });
    },
    async resonancesForInstance(graphNodeId: string): Promise<LitInstance[]> {
      return transport.resonancesForInstance({ graphNodeId });
    },
  };
}
