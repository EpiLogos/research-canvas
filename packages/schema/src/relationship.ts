/**
 * Canonical relationship vocabulary shared by the Neo4j substrate, the SQLite
 * local projection, and the canvas UI. The Rust `relationship_vocabulary.rs`
 * module is the runtime authority for the database CHECK constraint; this file
 * mirrors that vocabulary in TypeScript so surfaces cannot drift out of sync.
 *
 * Values are SCREAMING_SNAKE_CASE identifiers used as `rel_type` / `relationKind`.
 * Labels are human-readable UI text and may differ from the stored value.
 */

export type RelationshipKind =
  | "RELATES_TO"
  | "CONTAINS"
  | "PART_OF"
  | "NESTS"
  | "INSTANTIATES"
  | "ECHOES"
  | "CAUSES"
  | "INFLUENCES"
  | "OPPOSES"
  | "INHERITS"
  | "TRANSFORMS_INTO"
  | "LOCATED_AT"
  | "SOURCED_FROM"
  | "SUPPORTS"
  | "QUALIFIES"
  | "CONTESTS"
  | "CONTRADICTS"
  | "ARCHETYPE_EXPRESSES_AT"
  | "RESONATES_WITH"
  | "SEQUENCE_NEXT"
  | "UNCLASSIFIED_RESEARCH_CONNECTION"
  | "ENCAPSULATES";

export interface RelationshipKindOption {
  kind: RelationshipKind;
  label: string;
  description: string;
}

export const RELATIONSHIP_KINDS: readonly RelationshipKindOption[] = [
  {
    kind: "RELATES_TO",
    label: "Relates to",
    description: "A generic semantic connection between two nodes.",
  },
  {
    kind: "CONTAINS",
    label: "Contains",
    description: "A higher-order constellation or system contains this member.",
  },
  {
    kind: "PART_OF",
    label: "Part of",
    description: "This node is structurally part of a constellation or system.",
  },
  {
    kind: "NESTS",
    label: "Nests",
    description: "A higher-order constellation nests a completed child constellation.",
  },
  {
    kind: "INSTANTIATES",
    label: "Instantiates",
    description: "This datable instance realizes a trans-temporal pattern (the spine).",
  },
  {
    kind: "ECHOES",
    label: "Echoes",
    description: "A weaker recurrence of a pattern, work, or dynamic.",
  },
  {
    kind: "CAUSES",
    label: "Causes",
    description: "Direct historical consequence.",
  },
  {
    kind: "INFLUENCES",
    label: "Influences",
    description: "Ideological or textual transmission.",
  },
  {
    kind: "OPPOSES",
    label: "Opposes",
    description: "Polarity, read symmetrically (Christ ↔ Antichrist).",
  },
  {
    kind: "INHERITS",
    label: "Inherits",
    description: "Lineage, dynastic or institutional succession.",
  },
  {
    kind: "TRANSFORMS_INTO",
    label: "Transforms into",
    description: "Metamorphosis (visible empire → invisible governance).",
  },
  {
    kind: "LOCATED_AT",
    label: "Located at",
    description: "Placement at a Place node.",
  },
  {
    kind: "SOURCED_FROM",
    label: "Sourced from",
    description: "Provenance to a Source or text.",
  },
  {
    kind: "SUPPORTS",
    label: "Supports",
    description: "Evidence or argument that supports a claim or interpretation.",
  },
  {
    kind: "QUALIFIES",
    label: "Qualifies",
    description: "Evidence or context that constrains a claim without simply negating it.",
  },
  {
    kind: "CONTESTS",
    label: "Contests",
    description: "A source, claim, or interpretation that explicitly disputes another.",
  },
  {
    kind: "CONTRADICTS",
    label: "Contradicts",
    description: "A direct contradiction or negation between two claims.",
  },
  {
    kind: "ARCHETYPE_EXPRESSES_AT",
    label: "Expresses at",
    description: "An archetypal expression located at a specific instance.",
  },
  {
    kind: "RESONATES_WITH",
    label: "Resonates with",
    description: "Archetypal-field link to an archetype or operator.",
  },
  {
    kind: "SEQUENCE_NEXT",
    label: "Sequence next",
    description: "The next step in a guided narrative or argument sequence.",
  },
  {
    kind: "UNCLASSIFIED_RESEARCH_CONNECTION",
    label: "Unclassified research connection",
    description:
      "A retained legacy connection awaiting semantic classification; never a factual claim.",
  },
  {
    kind: "ENCAPSULATES",
    label: "Encapsulates",
    description:
      "A constellation encapsulates a child as a single node and can unfold it back with data intact.",
  },
] as const;

const RELATIONSHIP_KIND_SET: ReadonlySet<string> = new Set(
  RELATIONSHIP_KINDS.map((option) => option.kind),
);

export function isRelationshipKind(value: string): value is RelationshipKind {
  return RELATIONSHIP_KIND_SET.has(value);
}

export const DEFAULT_RELATIONSHIP_KIND: RelationshipKind = "RELATES_TO";
