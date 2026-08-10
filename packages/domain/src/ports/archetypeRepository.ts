import type { ArchetypalExpression, ArchetypeHeatmapEntry } from "@research-canvas/schema";

/**
 * Repository port for reading archetypal expressions and their derived heatmap.
 *
 * Expressions are stored as `ARCHETYPE_EXPRESSES_AT` relationships in Neo4j and,
 * where needed, as lightweight bookmarks in a surface layout store. This port
 * only defines the read surface that surfaces need to render the spectral
 * background layer.
 */
export interface ArchetypeRepository {
  listExpressions(archetypeId: string): Promise<ArchetypalExpression[]>;
  listExpressionsForTimeWindow(
    projectId: string,
    start: string,
    end: string,
  ): Promise<ArchetypalExpression[]>;
  listExpressionsForPlace(
    projectId: string,
    placeGraphNodeId: string,
  ): Promise<ArchetypalExpression[]>;
}

export type { ArchetypalExpression, ArchetypeHeatmapEntry };
