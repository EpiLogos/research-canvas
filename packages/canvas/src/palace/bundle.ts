import type { GraphNode, GraphRelationship } from "@research-canvas/desktop-api";

import type { PalaceCuration } from "./curation";
import type { EncapsulationEdgeInput } from "./encapsulation";
import type { PalaceScene } from "./renderer";

/**
 * Palace bundle serialization (refinement-2 D5.10): the self-contained
 * portable palace that the public viewer renders offline. The bundle is a
 * pure snapshot of the shared scene model plus the graph data it was built
 * from — nothing is re-derived on load, so the offline viewer renders exactly
 * what the desktop exported. All JSON-serializable plain data: no functions,
 * no class instances, no cycles.
 *
 * The Rust `write_palace_bundle_at` validates `formatVersion === 1` and the
 * presence of `scene` before writing `palace-bundle.json` into the output dir.
 */
export interface PalaceBundle {
  formatVersion: 1;
  profileScope: string;
  scene: PalaceScene;
  nodes: GraphNode[];
  relationships: GraphRelationship[];
  encapsulationEdges: EncapsulationEdgeInput[];
  curation: PalaceCuration | null;
}

export interface PalaceBundleInput {
  scene: PalaceScene;
  nodes: GraphNode[];
  relationships: GraphRelationship[];
  encapsulationEdges: EncapsulationEdgeInput[];
  curation: PalaceCuration | null;
}

export function buildPalaceBundle(input: PalaceBundleInput): PalaceBundle {
  return {
    formatVersion: 1,
    profileScope: input.scene.profileScope,
    scene: input.scene,
    nodes: input.nodes,
    relationships: input.relationships,
    encapsulationEdges: input.encapsulationEdges,
    curation: input.curation,
  };
}

/** Structural validation for the public-viewer loader (mirrors the Rust side). */
export function validatePalaceBundle(value: unknown): PalaceBundle | null {
  if (typeof value !== "object" || value === null) return null;
  const bundle = value as Record<string, unknown>;
  if (bundle.formatVersion !== 1) return null;
  if (typeof bundle.profileScope !== "string") return null;
  if (typeof bundle.scene !== "object" || bundle.scene === null) return null;
  const scene = bundle.scene as Record<string, unknown>;
  if (!Array.isArray(scene.rooms)) return null;
  if (!Array.isArray(bundle.nodes)) return null;
  if (!Array.isArray(bundle.relationships)) return null;
  if (!Array.isArray(bundle.encapsulationEdges)) return null;
  return value as PalaceBundle;
}
