import type { ColourTag, EntityType, TemporalPrecision } from "@research-canvas/schema";

/** The bounded temporal window requested by a timeline surface. */
export interface TimelineTimeWindow {
  startYear: number;
  endYear: number;
}

/** A dated, earthbound node projected onto the historical axis. */
export interface TimelineEarthboundNode {
  graphNodeId: string;
  title: string;
  date: string;
  precision: TemporalPrecision;
  entityType: EntityType;
  placeName: string | null;
  x: number;
  colorTag: ColourTag | null;
}

/** One bounded expression inside an archetypal spectral layer. */
export interface TimelineArchetypeExpression {
  start: string;
  end: string | null;
  placeName: string;
  colorTag: ColourTag;
}

/** Archetype projected as a background field rather than a dated event card. */
export interface TimelineArchetypeLayer {
  archetypeId: string;
  title: string;
  expressions: TimelineArchetypeExpression[];
}

/** Canonical read model for Surface #2. */
export interface TimelineWalk {
  earthboundNodes: TimelineEarthboundNode[];
  archetypeLayers: TimelineArchetypeLayer[];
}

/** Persisted per-tab camera and selection state for Surface #2. */
export interface TimelineViewState {
  centerYear: number;
  pixelsPerYear: number;
  selectedNodeId: string | null;
}

export interface TimelineRepository {
  getTimelineWalk(
    constellationId: string,
    timeWindow: TimelineTimeWindow,
  ): Promise<TimelineWalk>;
}
