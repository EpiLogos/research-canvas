import { z } from "zod";

import { passageRefSchema } from "./passage";
import { checkBoundOrder, isoTemporalBoundSchema } from "./time";

/**
 * Constellation ingestion (refinement-2 D11 + D12, ticket #27): QL-organised
 * constellations from raw sources and agent chats. Projects ARE constellations
 * (task #24, D7) — the `projects` row is the ingestion context, and this
 * contract is the constellation's substance: kind, flexible QL shape, time /
 * place / file metadata, assembly provenance, curation events, plus the ONE
 * deliberate substrate relation `ENCAPSULATES`.
 *
 * QL-organising is deliberately NOT a rigid mod-6 schema: a dyad, triad,
 * quaternity, 4+2, or nested structure is a living partial constellation. The
 * six positions are the complete frame, never a required slot count.
 */

export const CONSTELLATION_KINDS = ["episode", "document", "conceptual"] as const;
export const constellationKindSchema = z.enum(CONSTELLATION_KINDS);

/** Flexible constellation shapes — the sixfold is the complete frame, not a
 * required slot count. */
export const CONSTELLATION_SHAPES = [
  "dyad",
  "triad",
  "quaternity",
  "four_plus_two",
  "sixfold",
  "nested",
  "partial",
] as const;
export const constellationShapeSchema = z.enum(CONSTELLATION_SHAPES);

/** QL metadata for a constellation. Resonance tags stay optional; titles are
 * agent- or user-chosen and user-overridable (never forced into visible QL
 * vocabulary for non-bootstrapping profiles). */
export const constellationQlSchema = z.object({
  shape: constellationShapeSchema,
  /** Which of the six QL positions are present. Optional, and never required
   * to be complete — a dyad is a valid living partial structure. */
  qlPositions: z.array(z.number().int().min(0).max(5)).default([]),
  /** Optional QL resonance tags (position-lens coordinates). */
  resonanceTags: z.array(z.string().min(1)).default([]),
});

export const ASSEMBLY_SOURCES = ["agent_parse", "construct"] as const;
export const assemblySourceSchema = z.enum(ASSEMBLY_SOURCES);

export const PARSE_KINDS = ["ql", "mef"] as const;
export const parseKindSchema = z.enum(PARSE_KINDS);

/**
 * Assembly provenance — how the constellation was made. `agent_parse` means an
 * artifact (document/transcript/recording) was parsed via QL/MEF into
 * structure; `construct` means an idea network assembled over existing graph
 * objects. Either way the constellation is a derived artifact and must carry
 * passage-level provenance back to the raw corpus (which stays canonical and
 * agent-immutable).
 */
export const constellationAssemblySchema = z.object({
  source: assemblySourceSchema,
  /** Present when `source` is `agent_parse`: which parser produced the reading. */
  parseKind: parseKindSchema.optional(),
  /** The durable agent session (per-workspace tmux session) that produced the
   * chat / structure, when the work came from an agent. Harness-agnostic. */
  agentSessionId: z.string().min(1).optional(),
  /** Passage-level provenance: every derived artifact points back at raw
   * corpus passages. */
  rawSourceRefs: z.array(passageRefSchema).min(1),
  derivedAt: z.string().datetime(),
});

// Deliberately NOT named `CURATION_EVENT_TYPES` — scene.ts already owns that
// name for scene curation. Constellation curation is a distinct vocabulary
// (title/reorder/pin/exclude are shared, encapsulate/unfold are constellation-
// specific), so it lives under its own name and the two can never shadow each
// other through the package's star re-exports.
export const CONSTELLATION_CURATION_EVENT_TYPES = [
  "title",
  "reorder",
  "pin",
  "exclude",
  "encapsulate",
  "unfold",
] as const;
export const curationEventSchema = z.object({
  type: z.enum(CONSTELLATION_CURATION_EVENT_TYPES),
  at: z.string().datetime(),
  detail: z.string().optional(),
});

export const FILE_REF_KINDS = [
  "document",
  "transcript",
  "recording",
  "image",
  "chat",
] as const;
export const constellationFileRefSchema = z.object({
  path: z.string().min(1),
  kind: z.enum(FILE_REF_KINDS),
  passageRefs: z.array(passageRefSchema).default([]),
});

/** Members carry time, place, QL, file refs, deep details/content, other
 * metadata, and Neo4j edges, contemplated across other modular constellations. */
export const constellationMetadataSchema = z
  .object({
    time: z
      .object({
        start: isoTemporalBoundSchema,
        end: isoTemporalBoundSchema,
      })
      .nullable()
      .optional(),
    placeId: z.string().min(1).nullable().optional(),
    ql: constellationQlSchema.nullable().optional(),
    fileRefs: z.array(constellationFileRefSchema).default([]),
    content: z.string().optional(),
  })
  .superRefine((metadata, ctx) => {
    if (metadata.time) {
      checkBoundOrder(metadata.time.start, metadata.time.end, ctx, ["time"]);
    }
  });

/** The constellation record. `id` is an app-minted UUIDv4 that IS the
 * project/constellation row id (projects are constellations). */
export const constellationRecordSchema = z.object({
  id: z.string().uuid(),
  profileScope: z.string().min(1),
  kind: constellationKindSchema,
  title: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  parentConstellationId: z.string().min(1).nullable().optional(),
  metadata: constellationMetadataSchema,
  assembly: constellationAssemblySchema,
  curationEvents: z.array(curationEventSchema).default([]),
  /** Stable id for idempotent corpus seeding. */
  seedKey: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ENCAPSULATION_MODES = ["outgoing", "ingoing"] as const;
export const encapsulationModeSchema = z.enum(ENCAPSULATION_MODES);

/** The one deliberate substrate relation added by Task 6 (D12). Direction is
 * container → member; `mode` is the processual reading:
 * - `outgoing` (0/1, bimba) — the container node unfolds into its
 *   constellation (ground → articulation).
 * - `ingoing` (1/0, pratibimba) — the member constellation compresses into a
 *   single node included in a parent (articulation → ground).
 * The node and its constellation are the same object at two scales. Recursion
 * allowed; cycles prohibited (no transitive self-encapsulation). */
export const encapsulationEdgeSchema = z.object({
  containerGraphNodeId: z.string().min(1),
  memberGraphNodeId: z.string().min(1),
  mode: encapsulationModeSchema,
  seedKey: z.string().min(1).optional(),
});

export type ConstellationKind = z.infer<typeof constellationKindSchema>;
export type ConstellationShape = z.infer<typeof constellationShapeSchema>;
export type ConstellationQl = z.infer<typeof constellationQlSchema>;
export type AssemblySource = z.infer<typeof assemblySourceSchema>;
export type ParseKind = z.infer<typeof parseKindSchema>;
export type ConstellationAssembly = z.infer<typeof constellationAssemblySchema>;
export type CurationEvent = z.infer<typeof curationEventSchema>;
export type ConstellationFileRef = z.infer<typeof constellationFileRefSchema>;
export type ConstellationMetadata = z.infer<typeof constellationMetadataSchema>;
export type ConstellationRecord = z.infer<typeof constellationRecordSchema>;
export type EncapsulationMode = z.infer<typeof encapsulationModeSchema>;
export type EncapsulationEdge = z.infer<typeof encapsulationEdgeSchema>;

/**
 * Acyclicity for `ENCAPSULATES`: recursion is allowed, cycles are prohibited
 * (no transitive self-encapsulation). Adding `container → member` creates a
 * cycle iff `member` is already transitively contained in `container` (member
 * is a descendant of container). Returns the chain that would close into a
 * cycle (`member → … → container → member`), or `null` when the addition keeps
 * the encapsulation graph acyclic.
 */
export function encapsulationCycle(
  existing: EncapsulationEdge[],
  container: string,
  member: string,
): string[] | null {
  if (container === member) {
    return [member, container];
  }
  const adjacency = new Map<string, string[]>();
  for (const edge of existing) {
    const list = adjacency.get(edge.containerGraphNodeId) ?? [];
    list.push(edge.memberGraphNodeId);
    adjacency.set(edge.containerGraphNodeId, list);
  }
  // BFS from `member` following container→member edges. If we reach
  // `container`, adding container→member closes member → … → container → member.
  const parent = new Map<string, string | null>([[member, null]]);
  const queue = [member];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === container) {
      const chain: string[] = [];
      let node: string | null = current;
      while (node !== null) {
        chain.unshift(node);
        node = parent.get(node) ?? null;
      }
      return [...chain, member];
    }
    for (const next of adjacency.get(current) ?? []) {
      if (!parent.has(next)) {
        parent.set(next, current);
        queue.push(next);
      }
    }
  }
  return null;
}

/**
 * Validates a batch of `ENCAPSULATES` edges for acyclicity. Returns the first
 * closing cycle, or `null` when the whole set is acyclic. The result is
 * order-independent: any cycle in the final graph is caught when its closing
 * edge is added.
 */
export function assertAcyclicEncapsulation(
  edges: EncapsulationEdge[],
): string[] | null {
  const accumulated: EncapsulationEdge[] = [];
  for (const edge of edges) {
    const cycle = encapsulationCycle(
      accumulated,
      edge.containerGraphNodeId,
      edge.memberGraphNodeId,
    );
    if (cycle) {
      return cycle;
    }
    accumulated.push(edge);
  }
  return null;
}
