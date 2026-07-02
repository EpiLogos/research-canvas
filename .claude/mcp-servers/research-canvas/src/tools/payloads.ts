export interface PlaceNodeInput {
  graphNodeId: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  dotColour?: string;
  bgColour?: string;
  textColour?: string;
  thumbnail?: string;
}

export interface PlaceNodeBody {
  graph_node_id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  dot_colour?: string;
  bg_colour?: string;
  text_colour?: string;
  thumbnail?: string;
}

export type UpdateLayoutInput = Partial<PlaceNodeInput> & {
  graphNodeId: string;
};
export type UpdateLayoutBody = Partial<PlaceNodeBody> & {
  graph_node_id: string;
};

function prune<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out as T;
}

export function buildPlaceNodeBody(input: PlaceNodeInput): PlaceNodeBody {
  return prune({
    graph_node_id: input.graphNodeId,
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    dot_colour: input.dotColour,
    bg_colour: input.bgColour,
    text_colour: input.textColour,
    thumbnail: input.thumbnail,
  });
}

export function buildUpdateLayoutBody(
  input: UpdateLayoutInput,
): UpdateLayoutBody {
  return prune({
    graph_node_id: input.graphNodeId,
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    dot_colour: input.dotColour,
    bg_colour: input.bgColour,
    text_colour: input.textColour,
    thumbnail: input.thumbnail,
  });
}

export function buildBatchPlaceBody(input: {
  placements: Array<{
    graphNodeId: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
  }>;
}): {
  placements: Array<{
    graph_node_id: string;
    x: number;
    y: number;
    width?: number;
    height?: number;
  }>;
} {
  return {
    placements: input.placements.map((p) =>
      prune({
        graph_node_id: p.graphNodeId,
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
      }),
    ),
  };
}
