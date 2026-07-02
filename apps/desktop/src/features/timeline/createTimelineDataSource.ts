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
 * Adapt the WS0 §5.2 WorkspaceTransport to the narrow TimelineDataSource port
 * the TimelineLens needs. loadTimelineNodes asks for the server-filtered
 * "timeline" lens (only isTemporal === true nodes per WS0 §8.1) and returns the
 * GraphNode substance from each JoinedCanvasNode.
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
