import type { GeographyEdge } from "@research-canvas/schema";

/**
 * Profile-scoped geography-edge wire types (refinement-2 D2, ticket #19):
 * surface-layer movement streams between Temporal Place graph nodes, seeded
 * from the corpus with passage-level provenance. The shared TS zod contract in
 * @research-canvas/schema is the semantic authority; unlike scenes there are no
 * nullable wire fields, so the wire shape is the identity of `GeographyEdge`.
 */

export type GeographyEdgeWire = GeographyEdge;

export function geographyEdgeFromWire(wire: GeographyEdgeWire): GeographyEdge {
  return wire;
}

export function geographyEdgeToWire(edge: GeographyEdge): GeographyEdgeWire {
  return edge;
}

export interface ListGeographyEdgesRequest {
  databasePath: string;
  profileScope?: string;
}

export interface GeographyEdgeIdRequest {
  databasePath: string;
  id: string;
}

export interface UpsertGeographyEdgeRequest {
  databasePath: string;
  edge: GeographyEdge;
}

export type { GeographyEdge };
