import type { EntityType } from "@research-canvas/schema";

export type StoryTransition = "cut" | "fade" | "dissolve";

export interface StoryJourney {
  id: string;
  constellationId: string;
  title: string;
  sceneIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StoryAuthoringScene {
  id: string;
  journeyId: string;
  title: string;
  nodeIds: string[];
  mediaAssetIds: string[];
  narrationText: string;
  transition: StoryTransition;
  durationMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface StorySceneInput {
  title: string;
  nodeIds: string[];
  mediaAssetIds: string[];
  narrationText: string;
  transition: StoryTransition;
  durationMs: number;
}

export interface StoryNodeOption {
  graphNodeId: string;
  title: string;
  entityType: EntityType;
}

/**
 * Canonical authoring port for Surface #4.
 *
 * Journeys are constellation-scoped ordered scene sequences. The desktop
 * adapter persists them in the existing SQLite scene/scene-sequence store;
 * this port deliberately does not expose transport or migration-seed details
 * to the surface.
 */
export interface StoryRepository {
  listJourneys(constellationId: string): Promise<StoryJourney[]>;
  createJourney(constellationId: string, title: string): Promise<StoryJourney>;
  getJourneyScenes(journeyId: string): Promise<StoryAuthoringScene[]>;
  addScene(journeyId: string, input: StorySceneInput): Promise<StoryAuthoringScene>;
  updateScene(sceneId: string, input: StorySceneInput): Promise<StoryAuthoringScene>;
  reorderScenes(journeyId: string, sceneIds: string[]): Promise<void>;
  listNodeOptions(constellationId: string): Promise<StoryNodeOption[]>;
}
