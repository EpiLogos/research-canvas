import { z } from "zod";

import { viewportSchema } from "./canvas";

const nullToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === null ? undefined : value), schema);

export const positionSchema = z.object({
  x: z.number(),
  y: z.number()
});

export const sizeSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive()
});

export const timelineCardSchema = z.object({
  offsetY: z.number().default(0),
  width: z.number().positive().optional(),
  height: z.number().positive().optional()
});

export const ENTITY_TYPES = [
  "Figure",
  "People",
  "Event",
  "Institution",
  "Source",
  "Claim",
  "Myth",
  "Interpretation",
  "Place",
  "Work",
  "Archetype",
  "Dynamic",
  "Constellation",
  "PsychoidOperator",
] as const;
export const entityTypeSchema = z.enum(ENTITY_TYPES);

export const TEMPORAL_PRECISIONS = [
  "millennium",
  "century",
  "decade",
  "year",
  "month",
  "day",
] as const;
export const temporalPrecisionSchema = z.enum(TEMPORAL_PRECISIONS);

export const CONTENT_ORIGINS = [
  "seed",
  "corpus_compiled",
  "user_authored",
  "imported",
] as const;
export const contentOriginSchema = z.enum(CONTENT_ORIGINS);

export const HISTORICITIES = [
  "historical",
  "mythic",
  "literary",
  "theoretical",
  "mixed",
] as const;
export const historicitySchema = z.enum(HISTORICITIES);

export const CLAIM_KINDS = [
  "fact",
  "inference",
  "interpretation",
  "allegation",
  "hypothesis",
  "symbolic_parallel",
] as const;
export const claimKindSchema = z.enum(CLAIM_KINDS);

export const EVIDENCE_STATUSES = [
  "documented",
  "well_evidenced_inference",
  "interpretive",
  "contested",
  "alleged",
  "unverified",
  "disproven",
] as const;
export const evidenceStatusSchema = z.enum(EVIDENCE_STATUSES);

export const TEMPORAL_ROLES = [
  "occurred_at",
  "active_during",
  "source_published_at",
  "claim_about_time",
  "myth_located_at",
] as const;
export const temporalRoleSchema = z.enum(TEMPORAL_ROLES);

export const PLACE_COVERAGES = ["resolved", "unknown", "not_applicable"] as const;
export const placeCoverageSchema = z.enum(PLACE_COVERAGES);

export const QL_FORMS = [
  "complete_sixfold",
  "partial_positional_map",
  "quaternity",
  "position_wheel",
  "double_helix",
  "other_explicit",
] as const;
export const qlFormSchema = z.enum(QL_FORMS);

export const QL_ARCS = ["day", "night", "braided", "not_applicable"] as const;
export const qlArcSchema = z.enum(QL_ARCS);

export const QL_TOPOLOGIES = [
  "torus",
  "klein",
  "lemniscatic",
  "composite",
  "unspecified",
] as const;
export const qlTopologySchema = z.enum(QL_TOPOLOGIES);

/** Completeness is structural, not a confidence score. `incomplete` means a
 * declared form violates its required membership; `partial` is intentional. */
export const QL_COMPLETENESS_STATUSES = [
  "complete",
  "partial",
  "incomplete",
  "not_applicable",
] as const;
export const qlCompletenessStatusSchema = z.enum(QL_COMPLETENESS_STATUSES);

export const EMPTY_GRAPH_NODE_METADATA = {
  evidenceTags: [] as string[], sourceKind: null, contentOrigin: null,
  contentRevision: null, seedSchemaVersion: null, bodySourceCoordinates: [] as string[],
  historicity: null, claimKind: null, evidenceStatus: null, temporalRole: null,
  placeCoverage: null, qlForm: null, qlUnitId: null, qlArc: null,
  qlTopology: null, qlSchemaVersion: null, qlSourceCoordinates: [] as string[],
  qlCompletenessStatus: null,
} as const;

/**
 * Canonical graph-substance transport contract. Migration-era metadata is
 * represented by explicit nullable keys; coordinate collections are always
 * arrays. This keeps Rust/Serde and TypeScript payloads byte-shape compatible.
 * Unknown controlled values are rejected here. Import/migration code must
 * preserve them before this boundary rather than widening the runtime model.
 */
export const graphNodeSchema = z.strictObject({
  graphNodeId: z.string().min(1),
  entityType: entityTypeSchema,
  title: z.string(),
  body: z.string(),
  summary: z.string(),
  archetypalResonance: z.string().nullable(),
  coordinate: z.string().nullable(),
  sourceCoordinates: z.array(z.string()),
  evidenceTags: z.array(z.string()),
  sourceKind: z.string().nullable(),
  contentOrigin: contentOriginSchema.nullable(),
  contentRevision: z.number().int().nonnegative().nullable(),
  seedSchemaVersion: z.number().int().nonnegative().nullable(),
  bodySourceCoordinates: z.array(z.string()),
  historicity: historicitySchema.nullable(),
  claimKind: claimKindSchema.nullable(),
  evidenceStatus: evidenceStatusSchema.nullable(),
  temporalRole: temporalRoleSchema.nullable(),
  placeCoverage: placeCoverageSchema.nullable(),
  qlForm: qlFormSchema.nullable(),
  qlUnitId: z.string().nullable(),
  qlArc: qlArcSchema.nullable(),
  qlTopology: qlTopologySchema.nullable(),
  qlSchemaVersion: z.number().int().nonnegative().nullable(),
  qlSourceCoordinates: z.array(z.string()),
  qlCompletenessStatus: qlCompletenessStatusSchema.nullable(),
  isTemporal: z.boolean(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  temporalPrecision: temporalPrecisionSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Explicit compatibility boundary for graph payloads written before the
 * canonical metadata contract. Its output is always a canonical GraphNode. */
export const legacyGraphNodeInputSchema = graphNodeSchema
  .partial({
    evidenceTags: true, sourceKind: true, contentOrigin: true, contentRevision: true,
    seedSchemaVersion: true, bodySourceCoordinates: true, historicity: true,
    claimKind: true, evidenceStatus: true, temporalRole: true, placeCoverage: true,
    qlForm: true, qlUnitId: true, qlArc: true, qlTopology: true,
    qlSchemaVersion: true, qlSourceCoordinates: true, qlCompletenessStatus: true,
  })
  .transform((input) => graphNodeSchema.parse({ ...EMPTY_GRAPH_NODE_METADATA, ...input }));

export function normalizeLegacyGraphNode(input: unknown): GraphNodeContract {
  return legacyGraphNodeInputSchema.parse(input);
}

const baseNodeSchema = z.object({
  id: z.string().min(1),
  graphNodeId: z.string().min(1).nullable().default(null),
  canvasId: z.string().uuid(),
  title: z.string().min(1),
  position: positionSchema,
  size: sizeSchema,
  summary: z.string().default(""),
  dotColour: nullToUndefined(z.string().optional()),
  bgColour: nullToUndefined(z.string().optional()),
  textColour: nullToUndefined(z.string().optional()),
  thumbnail: nullToUndefined(z.string().optional()),
  timelineCard: nullToUndefined(timelineCardSchema.optional()),
  sequenceCaption: nullToUndefined(z.string().nullable().default(null)),
  sequenceViewport: nullToUndefined(viewportSchema.nullable().default(null)),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const resourceNodeSchema = baseNodeSchema.extend({
  type: z.literal("resource"),
  resourceKind: z.enum(["markdown", "text", "pdf", "image", "audio", "video", "directory", "url", "binary"]),
  absolutePath: z.string().min(1),
  relativePath: z.string().min(1),
  mimeType: z.string().min(1),
  fileFingerprint: z.string().min(1),
  url: nullToUndefined(z.string().url().optional())
});

export const noteNodeSchema = baseNodeSchema.extend({
  type: z.literal("note"),
  content: nullToUndefined(z.string().default("")),
  tags: z.array(z.string()).default([])
});

export const groupNodeSchema = baseNodeSchema.extend({
  type: z.literal("group"),
  color: z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/),
  childNodeIds: z.array(z.string().uuid()).default([])
});

export const portalNodeSchema = baseNodeSchema.extend({
  type: z.literal("portal"),
  targetCanvasId: z.string().uuid(),
  constellationKind: nullToUndefined(z.enum(["standard", "ql-unit"]).default("standard"))
});

export const nodeSchema = z.discriminatedUnion("type", [
  resourceNodeSchema,
  noteNodeSchema,
  groupNodeSchema,
  portalNodeSchema
]);

export type Position = z.infer<typeof positionSchema>;
export type Size = z.infer<typeof sizeSchema>;
export type ResourceNode = z.infer<typeof resourceNodeSchema>;
export type NoteNode = z.infer<typeof noteNodeSchema>;
export type GroupNode = z.infer<typeof groupNodeSchema>;
export type PortalNode = z.infer<typeof portalNodeSchema>;
export type CanvasNode = z.infer<typeof nodeSchema>;
export type EntityType = z.infer<typeof entityTypeSchema>;
export type TemporalPrecision = z.infer<typeof temporalPrecisionSchema>;
export type ContentOrigin = z.infer<typeof contentOriginSchema>;
export type Historicity = z.infer<typeof historicitySchema>;
export type ClaimKind = z.infer<typeof claimKindSchema>;
export type EvidenceStatus = z.infer<typeof evidenceStatusSchema>;
export type TemporalRole = z.infer<typeof temporalRoleSchema>;
export type PlaceCoverage = z.infer<typeof placeCoverageSchema>;
export type QlForm = z.infer<typeof qlFormSchema>;
export type QlArc = z.infer<typeof qlArcSchema>;
export type QlTopology = z.infer<typeof qlTopologySchema>;
export type QlCompletenessStatus = z.infer<typeof qlCompletenessStatusSchema>;
export type GraphNodeContract = z.infer<typeof graphNodeSchema>;
