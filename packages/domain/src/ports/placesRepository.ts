import type {
  ArchetypalExpression,
  GeographyEdge,
  GraphNodeContract,
  TemporalPlace,
} from "@research-canvas/schema";

/** A canonical graph node whose Temporal Place projection is present. */
export type LocatedGraphNode = GraphNodeContract & { place: TemporalPlace };

/**
 * Project-wide read boundary for Surface #3 Places.
 *
 * Places is not a walk or scene projection: it starts from every canonical
 * located graph node in the active project, then composes durable movement
 * edges and focused relational/archetypal context on demand.
 */
export interface PlacesRepository {
  getLocatedNodes(projectId: string): Promise<LocatedGraphNode[]>;
  getGeographyEdges(projectId: string): Promise<GeographyEdge[]>;
  getArchetypeExpressionsForPlace(
    projectId: string,
    placeGraphNodeId: string,
  ): Promise<ArchetypalExpression[]>;
  getRelatedNodesForPlace(
    projectId: string,
    placeGraphNodeId: string,
  ): Promise<GraphNodeContract[]>;
}
