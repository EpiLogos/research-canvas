export type RelationshipKind =
  | "INSTANTIATES"
  | "ECHOES"
  | "CAUSES"
  | "INFLUENCES"
  | "OPPOSES"
  | "INHERITS"
  | "TRANSFORMS_INTO"
  | "LOCATED_AT"
  | "SOURCED_FROM"
  | "RESONATES_WITH";

export interface RelationshipKindOption {
  kind: RelationshipKind;
  label: string;
  description: string;
}

export const RELATIONSHIP_KINDS: readonly RelationshipKindOption[] = [
  { kind: "INSTANTIATES", label: "Instantiates", description: "This datable instance realizes a trans-temporal pattern (the spine)." },
  { kind: "ECHOES", label: "Echoes", description: "A weaker recurrence of a pattern, work, or dynamic." },
  { kind: "CAUSES", label: "Causes", description: "Direct historical consequence." },
  { kind: "INFLUENCES", label: "Influences", description: "Ideological or textual transmission." },
  { kind: "OPPOSES", label: "Opposes", description: "Polarity, read symmetrically (Christ ↔ Antichrist)." },
  { kind: "INHERITS", label: "Inherits", description: "Lineage, dynastic or institutional succession." },
  { kind: "TRANSFORMS_INTO", label: "Transforms into", description: "Metamorphosis (visible empire → invisible governance)." },
  { kind: "LOCATED_AT", label: "Located at", description: "Placement at a Place node." },
  { kind: "SOURCED_FROM", label: "Sourced from", description: "Provenance to a Source or text." },
  { kind: "RESONATES_WITH", label: "Resonates with", description: "Archetypal-field link to an archetype or operator." },
] as const;

const RELATIONSHIP_KIND_SET: ReadonlySet<string> = new Set(
  RELATIONSHIP_KINDS.map((option) => option.kind),
);

export function isRelationshipKind(value: string): value is RelationshipKind {
  return RELATIONSHIP_KIND_SET.has(value);
}
