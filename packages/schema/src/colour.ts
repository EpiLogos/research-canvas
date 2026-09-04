import { z } from "zod";

/**
 * Grounded colour tags give stable semantic meaning to node and surface colours
 * across themes. A tag is the primary colour driver; `custom*` fields on
 * `NodeStyle` are presentation overrides that take precedence when present.
 */
export const COLOUR_TAGS = [
  "evidence-documented",
  "evidence-interpretive",
  "evidence-contested",
  "historicity-mythic",
  "historicity-historical",
  "archetype-expression",
  "relation-causal",
  "relation-analogical",
  "surface-places",
  "surface-palace",
] as const;

export const colourTagSchema = z.enum(COLOUR_TAGS);

export type ColourTag = z.infer<typeof colourTagSchema>;

/**
 * Reusable node style contract. Stored on canvas nodes alongside the legacy
 * dotColour/bgColour/textColour fields so that migration can preserve explicit
 * colour overrides as custom values without losing them.
 */
export const nodeStyleSchema = z.object({
  colourTag: colourTagSchema.nullable(),
  customDotColour: z.string().nullable().optional(),
  customBgColour: z.string().nullable().optional(),
  customTextColour: z.string().nullable().optional(),
});

export type NodeStyle = z.infer<typeof nodeStyleSchema>;

/** Human-readable label for a colour tag, without duplicating the namespace. */
export function labelForTag(tag: ColourTag): string {
  return tag
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Derive a grounded colour tag from canonical node metadata when the mapping
 * is unambiguous. Returns `null` when no obvious tag applies so callers can
 * fall back to theme defaults or custom overrides.
 */
export function deriveColourTag(input: {
  entityType?: string | null;
  historicity?: string | null;
  evidenceStatus?: string | null;
}): ColourTag | null {
  const { entityType, historicity, evidenceStatus } = input;

  if (evidenceStatus === "documented") return "evidence-documented";
  if (evidenceStatus === "interpretive") return "evidence-interpretive";
  if (evidenceStatus === "contested") return "evidence-contested";
  if (historicity === "mythic") return "historicity-mythic";
  if (historicity === "historical") return "historicity-historical";
  if (entityType === "Archetype") return "archetype-expression";

  return null;
}

interface MigrateNodeStyleInput {
  colourTag?: ColourTag | null;
  dotColour?: string | null;
  bgColour?: string | null;
  textColour?: string | null;
  entityType?: string | null;
  historicity?: string | null;
  evidenceStatus?: string | null;
}

/**
 * Migration helper for persisted nodes that pre-date grounded colour tags.
 *
 * - If a node already has a `colourTag`, keep it and leave custom overrides
 *   empty so the tag remains authoritative.
 * - If the node has explicit legacy colours but no tag, preserve them as
 *   `custom*` overrides and do NOT invent a tag.
 * - Otherwise, derive an obvious tag from `entityType`/`historicity`/
 *   `evidenceStatus` when possible.
 */
export function migrateNodeStyle(input: MigrateNodeStyleInput): NodeStyle {
  const hasExplicitColour =
    input.dotColour != null ||
    input.bgColour != null ||
    input.textColour != null;

  if (input.colourTag != null) {
    return {
      colourTag: input.colourTag,
      customDotColour: input.dotColour ?? null,
      customBgColour: input.bgColour ?? null,
      customTextColour: input.textColour ?? null,
    };
  }

  if (hasExplicitColour) {
    return {
      colourTag: null,
      customDotColour: input.dotColour ?? null,
      customBgColour: input.bgColour ?? null,
      customTextColour: input.textColour ?? null,
    };
  }

  return {
    colourTag: deriveColourTag(input),
    customDotColour: null,
    customBgColour: null,
    customTextColour: null,
  };
}
